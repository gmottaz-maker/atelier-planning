import { thumbnailStream } from '../../../lib/kdrive'

export default async function handler(req, res) {
  const { fileId } = req.query
  if (!fileId) return res.status(400).end()
  try {
    const r = await thumbnailStream(fileId)
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg')
    res.setHeader('Cache-Control', 'private, max-age=3600')
    const buf = await r.arrayBuffer()
    res.send(Buffer.from(buf))
  } catch (e) {
    res.status(500).end()
  }
}
