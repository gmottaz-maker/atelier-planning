import { useCallback, useRef, useState } from 'react'

// Client Google Agenda côté navigateur (lecture + écriture d'événements).
// Scope complet `calendar` pour pouvoir lister les agendas ET créer/éditer.
const SCOPE     = 'https://www.googleapis.com/auth/calendar'
const DISCOVERY = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest'

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve()
    const s = document.createElement('script')
    s.src = src; s.async = true; s.onload = resolve; s.onerror = reject
    document.head.appendChild(s)
  })
}

export function useGoogleCalendar() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID
  const [connected, setConnected]   = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError]           = useState('')
  const [calendars, setCalendars]   = useState([])
  const tokenClientRef = useRef(null)
  const readyRef       = useRef(false)

  const ensureGapi = useCallback(async () => {
    await Promise.all([
      loadScript('https://apis.google.com/js/api.js'),
      loadScript('https://accounts.google.com/gsi/client'),
    ])
    if (!readyRef.current) {
      await new Promise((res, rej) => window.gapi.load('client', { callback: res, onerror: rej }))
      await window.gapi.client.init({})
      await window.gapi.client.load(DISCOVERY)
      readyRef.current = true
    }
  }, [])

  const requestToken = useCallback((prompt = '') => new Promise((resolve, reject) => {
    if (!tokenClientRef.current) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId, scope: SCOPE, callback: () => {},
      })
    }
    tokenClientRef.current.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error))
      window.gapi.client.setToken({ access_token: resp.access_token })
      resolve(resp.access_token)
    }
    tokenClientRef.current.requestAccessToken({ prompt })
  }), [clientId])

  // Ré-essaie en re-demandant un token si expiré (401)
  const withToken = useCallback(async (fn) => {
    try { return await fn() }
    catch (e) {
      const code = e?.status || e?.result?.error?.code
      if (code === 401) { await requestToken(''); return await fn() }
      throw e
    }
  }, [requestToken])

  const connect = useCallback(async ({ silent = false } = {}) => {
    if (!clientId) { setError('NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID manquant'); return false }
    setConnecting(true); setError('')
    try {
      await ensureGapi()
      await requestToken(silent ? '' : '')
      const res = await window.gapi.client.calendar.calendarList.list({ maxResults: 250 })
      const cals = (res.result.items || []).map(c => ({
        id: c.id, summary: c.summary, primary: !!c.primary,
        accessRole: c.accessRole, color: c.backgroundColor,
        writable: c.accessRole === 'owner' || c.accessRole === 'writer',
      }))
      setCalendars(cals)
      setConnected(true)
      if (typeof window !== 'undefined') localStorage.setItem('gcalConnected', '1')
      return true
    } catch (e) {
      setError(e?.result?.error?.message || e?.message || 'Erreur Google Agenda')
      if (silent && typeof window !== 'undefined') localStorage.removeItem('gcalConnected')
      return false
    } finally {
      setConnecting(false)
    }
  }, [clientId, ensureGapi, requestToken])

  const listEvents = useCallback(async (timeMin, timeMax, calIds) => {
    const cals = (calIds && calIds.length) ? calendars.filter(c => calIds.includes(c.id)) : calendars
    const out = []
    await Promise.all(cals.map(async cal => {
      try {
        const r = await withToken(() => window.gapi.client.calendar.events.list({
          calendarId: cal.id, timeMin, timeMax, singleEvents: true, orderBy: 'startTime', maxResults: 250,
        }))
        ;(r.result.items || []).forEach(ev => out.push({
          ...ev, _calendarId: cal.id, _calName: cal.summary, _color: cal.color, _writable: cal.writable,
        }))
      } catch (_) { /* on ignore un agenda qui échoue */ }
    }))
    return out
  }, [calendars, withToken])

  const createEvent = useCallback((calendarId, resource) =>
    withToken(() => window.gapi.client.calendar.events.insert({ calendarId, resource })), [withToken])
  const updateEvent = useCallback((calendarId, eventId, resource) =>
    withToken(() => window.gapi.client.calendar.events.patch({ calendarId, eventId, resource })), [withToken])
  const deleteEvent = useCallback((calendarId, eventId) =>
    withToken(() => window.gapi.client.calendar.events.delete({ calendarId, eventId })), [withToken])

  return { connected, connecting, error, calendars, connect, listEvents, createEvent, updateEvent, deleteEvent }
}
