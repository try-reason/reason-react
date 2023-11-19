import StreamDecoder, { dividerEnd, dividerStart, errorIdentifier } from "reason-decoder";
import { useRef, useState } from "react";

async function* fetchReason(url: string, body: Record<string, any>, headers: Record<string, string>, method: string) {
  const res = await fetch(url, {
    method,
    body: method === 'GET' ? undefined: JSON.stringify(body),
    headers: {
      ...headers,
      'Content-Type': 'application/json'
    }
  })

  const contentType = res.headers.get('Content-Type');

  if (contentType?.includes('application/json')) {
    const json = await res.json()
    return { type: 'not-stream', data: json }
  }
  if (contentType?.includes('text/html')) {
    const text = await res.text()
    return { type: 'not-stream', data: text }
  }

  const stream = res.body
  if (!stream) throw new Error('No stream')
  const reader = stream.getReader()

  let result = await reader.read()

  let buffer = ''

  while (!result.done) {
    const { value } = result

    const text = new TextDecoder("utf-8").decode(value)
    yield text

    result = await reader.read()
  }
}

interface ReasonProps { 
  body: Record<string, any>;
  headers: Record<string, string>;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
}

export default function useReason(entrypointUrl: string) {
  const [data, setResponse] = useState<Record<string, any>>({})
  const onFinishCallback = useRef<(() => void) | null>(null);
  const onErrorCallback = useRef<(() => void) | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isStreaming, setIsStreaming] = useState<boolean>(false)

  function onFinish(fn: () => void) {
    onFinishCallback.current = fn
  }
  
  function onError(fn: () => void) {
    onErrorCallback.current = fn
  }

  async function reason(prop?: Partial<ReasonProps>) {
    try {
      setIsLoading(true)
      setResponse({})
      let decoder = new StreamDecoder()
  
      const body = prop?.body ?? {}
      const headers = prop?.headers ?? {}
  
      let gen = fetchReason(entrypointUrl, body, headers, prop?.method ?? 'POST')
      let result = await gen.next()
      setIsLoading(false)
      setIsStreaming(true)
      while (!result.done) {
        const { value } = result
        
        const obj = {...decoder.decode(value)}
        
        setResponse(obj)
  
        result = await gen.next()
      }

      if (result.value?.type === 'not-stream') {
        setResponse(result.value.data)
      }
  
      if (onFinishCallback.current) {
        onFinishCallback.current();
      }
    } catch (err) {
      console.error(err)
      if (onErrorCallback.current) {
        onErrorCallback.current();
      }
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
    }
  }

  return {
    data,
    reason,
    onFinish,
    onError,
    isLoading,
    isStreaming,
  }
}