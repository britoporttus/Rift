'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

export type WsMsg = {
  type: string
  _id?: number
  _streaming?: boolean
  [key: string]: unknown
}

export function useEngagementWS(engagementId: string | null, sessionId: string | null = null) {
  const [messages, setMessages]      = useState<WsMsg[]>([])
  const [connected, setConnected]    = useState(false)
  const [isThinking, setIsThinking]  = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  // Travado pelo sinal explícito agent_status (running/idle) vindo do backend.
  const [agentRunning, setAgentRunning] = useState(false)
  // Medidor de "memória": tamanho do contexto no último turno.
  const [contextUsage, setContextUsage] = useState<{ tokens: number; limit: number; percent: number } | null>(null)
  // REL-5: incrementa a cada REconexão bem-sucedida (não na 1ª conexão). O painel
  // observa isto para recarregar o histórico e recuperar eventos perdidos na queda.
  const [reconnectNonce, setReconnectNonce] = useState(0)
  const wsRef        = useRef<WebSocket | null>(null)
  const counter      = useRef(0)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pingRef      = useRef<ReturnType<typeof setInterval> | null>(null)
  const attemptsRef  = useRef(0)

  useEffect(() => {
    // Don't connect until we know which session to use
    if (!engagementId || !sessionId) return
    const token = localStorage.getItem('rift_token')
    if (!token) return

    // Reset state only when the session/engagement actually changes — NOT on reconnect,
    // senão o feed "apaga" toda vez que a conexão cai e volta.
    setMessages([])
    setIsThinking(false)
    setIsStreaming(false)
    setAgentRunning(false)
    setContextUsage(null)

    let cancelled = false  // distingue close intencional (unmount/troca) de queda de rede

    const handleMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data) as WsMsg

        // Heartbeat reply do servidor — ignorar
        if (msg.type === 'pong') return

        // Connection handshake — show as info but don't affect streaming state
        if (msg.type === 'connection_ready') {
          setMessages((prev) => [...prev, { ...msg, _id: ++counter.current }])
          return
        }

        // Sinal de ciclo de vida: trava/libera o input do operador.
        if (msg.type === 'agent_status') {
          const running = msg.state === 'running'
          setAgentRunning(running)
          if (running) {
            setIsThinking(true)
          } else {
            setIsThinking(false)
            setIsStreaming(false)
            // Finaliza qualquer bolha em streaming
            setMessages((prev) => {
              const last = prev[prev.length - 1]
              if (last?._streaming) return [...prev.slice(0, -1), { ...last, _streaming: false }]
              return prev
            })
          }
          return
        }

        if (msg.type === 'agent_thinking') {
          setIsThinking(true)
          setIsStreaming(false)
          return
        }

        if (msg.type === 'agent_message') {
          setIsThinking(false)
          setIsStreaming(true)
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.type === 'agent_message' && last._streaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, text: String(last.text ?? '') + String(msg.text ?? '') },
              ]
            }
            return [...prev, { ...msg, _id: ++counter.current, _streaming: true }]
          })
          return
        }

        if (msg.type === 'context_usage') {
          setContextUsage({
            tokens:  Number(msg.tokens ?? 0),
            limit:   Number(msg.limit ?? 200000),
            percent: Number(msg.percent ?? 0),
          })
          return
        }

        if (msg.type === 'cost_update') {
          setIsThinking(false)
          setIsStreaming(false)
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            const base = last?._streaming
              ? [...prev.slice(0, -1), { ...last, _streaming: false }]
              : prev
            return [...base, { ...msg, _id: ++counter.current }]
          })
          return
        }

        if (msg.type === 'agent_question') {
          setIsThinking(false)
          setIsStreaming(false)
        }

        setMessages((prev) => {
          const last = prev[prev.length - 1]
          const base = last?._streaming
            ? [...prev.slice(0, -1), { ...last, _streaming: false }]
            : prev
          return [...base, { ...msg, _id: ++counter.current }]
        })
      } catch {}
    }

    const connect = () => {
      if (cancelled) return
      const proto  = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsBase = `${proto}//${window.location.host}`
      // SEC-4: o token vai no subprotocolo 'rift-jwt' (2º elemento), não na query
      // string — que apareceria nos logs de acesso do proxy/Cloudflare.
      const ws = new WebSocket(
        `${wsBase}/ws?engagementId=${engagementId}&sessionId=${encodeURIComponent(sessionId)}`,
        ['rift-jwt', token]
      )
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        const wasReconnect = attemptsRef.current > 0
        attemptsRef.current = 0
        if (wasReconnect) setReconnectNonce((n) => n + 1)
        // Heartbeat: proxies (Cloudflare ~100s) derrubam WS ocioso. Mantém vivo.
        if (pingRef.current) clearInterval(pingRef.current)
        pingRef.current = setInterval(() => {
          if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'ping' }))
        }, 25000)
      }

      ws.onerror = () => setConnected(false)

      ws.onmessage = handleMessage

      ws.onclose = () => {
        setConnected(false)
        setIsThinking(false)
        setIsStreaming(false)
        // Não trava o input enquanto desconectado (o gate `connected` já cobre isso).
        setAgentRunning(false)
        if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null }
        // Finaliza qualquer mensagem em streaming (sem apagar o histórico)
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (last?._streaming) return [...prev.slice(0, -1), { ...last, _streaming: false }]
          return prev
        })
        wsRef.current = null
        if (cancelled) return
        // Reconexão automática com backoff exponencial (cap 15s) — NÃO apaga o feed
        const delay = Math.min(1000 * 2 ** attemptsRef.current, 15000)
        attemptsRef.current += 1
        reconnectRef.current = setTimeout(connect, delay)
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectRef.current) clearTimeout(reconnectRef.current)
      if (pingRef.current) clearInterval(pingRef.current)
      const ws = wsRef.current
      wsRef.current = null
      ws?.close()
    }
  }, [engagementId, sessionId])

  const send = useCallback((msg: Omit<WsMsg, '_id'>) => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const addLocal = useCallback((msg: WsMsg) => {
    setMessages((prev) => [...prev, { ...msg, _id: ++counter.current }])
  }, [])

  return { messages, connected, send, addLocal, isThinking, isStreaming, agentRunning, contextUsage, reconnectNonce }
}
