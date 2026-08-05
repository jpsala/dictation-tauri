const DEFAULT_MAX_FRAME_BYTES = 1024 * 1024
const DEFAULT_MAX_REASSEMBLED_BYTES = 64 * 1024 * 1024
const RPC_CHUNK_PAYLOAD_BYTES = 256 * 1024
const MAX_CHUNK_ID_LENGTH = 128

export const defaultOmpMaxFrameBytes = DEFAULT_MAX_FRAME_BYTES

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && Number(value) > 0
}

function decodeCanonicalBase64(value) {
  if (typeof value !== 'string' || value.length === 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Datos rpc_chunk inválidos.')
  }
  const bytes = Buffer.from(value, 'base64')
  if (bytes.toString('base64') !== value) throw new Error('Datos rpc_chunk no canónicos.')
  return bytes
}

export class OmpRpcChunkReassembler {
  constructor() {
    this.maxFrameBytes = DEFAULT_MAX_FRAME_BYTES
    this.maxReassembledFrameBytes = DEFAULT_MAX_REASSEMBLED_BYTES
    this.pending = undefined
  }

  setLimits(maxFrameBytes, maxReassembledFrameBytes) {
    if (!positiveSafeInteger(maxFrameBytes)
      || !positiveSafeInteger(maxReassembledFrameBytes)
      || maxFrameBytes > DEFAULT_MAX_FRAME_BYTES
      || maxReassembledFrameBytes > DEFAULT_MAX_REASSEMBLED_BYTES
      || maxReassembledFrameBytes < maxFrameBytes) {
      throw new Error('OMP RPC anunció límites de transporte inválidos.')
    }
    this.maxFrameBytes = maxFrameBytes
    this.maxReassembledFrameBytes = maxReassembledFrameBytes
  }

  push(value) {
    if (!isObject(value)) throw new Error('El frame OMP RPC debe ser un objeto.')
    if (value.type !== 'rpc_chunk') {
      if (this.pending) throw new Error('La secuencia rpc_chunk fue interrumpida.')
      return value
    }
    const { chunkId, index, count, byteLength } = value
    if (typeof chunkId !== 'string' || chunkId.length === 0 || chunkId.length > MAX_CHUNK_ID_LENGTH || !Number.isSafeInteger(index) || !Number.isSafeInteger(count) || !Number.isSafeInteger(byteLength) || index < 0 || count < 2 || count > Math.ceil(this.maxReassembledFrameBytes / RPC_CHUNK_PAYLOAD_BYTES) || index >= count || byteLength < this.maxFrameBytes || byteLength > this.maxReassembledFrameBytes) {
      throw new Error('Metadatos rpc_chunk inválidos.')
    }
    const bytes = decodeCanonicalBase64(value.data)
    if (bytes.byteLength > RPC_CHUNK_PAYLOAD_BYTES) throw new Error('El payload rpc_chunk excede el límite de transporte.')
    if (!this.pending) {
      if (index !== 0) throw new Error('La secuencia rpc_chunk debe comenzar en índice 0.')
      this.pending = { chunkId, count, byteLength, nextIndex: 0, receivedBytes: 0, chunks: [] }
    }
    const pending = this.pending
    if (pending.chunkId !== chunkId || pending.count !== count || pending.byteLength !== byteLength || pending.nextIndex !== index) throw new Error('La secuencia rpc_chunk no coincide.')
    pending.chunks.push(bytes)
    pending.receivedBytes += bytes.byteLength
    pending.nextIndex += 1
    if (pending.receivedBytes > pending.byteLength) throw new Error('La secuencia rpc_chunk excede el largo declarado.')
    if (pending.nextIndex < pending.count) return undefined
    if (pending.receivedBytes !== pending.byteLength) throw new Error('La secuencia rpc_chunk tiene largo incompleto.')
    this.pending = undefined
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(pending.chunks))
    const frame = JSON.parse(decoded)
    if (!isObject(frame)) throw new Error('El frame OMP RPC debe ser un objeto.')
    return frame
  }
}
