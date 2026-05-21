'use client'
import { useState, useEffect, useRef, useCallback } from 'react'

export type WsMsg = { type: string; _id?: number; [key: string]: unknown }

export function useEngagementWS(engagementId: string | null) {
  const [messages, setMessages] = useState<WsMsg[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const counter = useRef(0)

  useEffect(() => {
    if (!engagementId) return
    const token = localStorage.getItem('rift_token')
    if (!token) return

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsBase = `${proto}//${window.location.host}`
    const ws = new WebSocket(`${wsBase}/ws?engagementId=${engagementId}&token=${token}`)
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => { setConnected(false); wsRef.current = null }
    ws.onerror = () => setConnected(false)
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WsMsg
        msg._id = ++counter.current
        // cost_update and phase_update don't add to feed — handled separately
        setMessages((prev) => [...prev, msg])
      } catch {}
    }

    return () => { ws.close() }
  }, [engagementId])

  const send = useCallback((msg: Omit<WsMsg, '_id'>) => {
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  return { messages, connected, send }
}
