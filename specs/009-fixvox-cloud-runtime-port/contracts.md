# Contracts: Fixvox Cloud Runtime Port

## Register Device

`POST /v2/device/register`

Request:

```json
{
  "installId": "string",
  "deviceId": "string|null",
  "version": "string",
  "platform": "string",
  "arch": "string",
  "hostname": "string",
  "ts": "iso-string"
}
```

Response includes `ok`, `deviceId`, `activated`, `policyId`, `policyLabel`, `auth`, `features`, `defaults`, `limits`, `telemetry`, `transportPolicy`.

## Execution Preflight

`POST /v2/execution/preflight`

Request:

```json
{
  "mode": "managed",
  "installId": "string",
  "deviceId": "string",
  "usageKind": "transcription",
  "estimate": 12
}
```

Response:

```json
{
  "ok": true,
  "allowed": true,
  "reason": null,
  "limits": {}
}
```

## Managed STT

`POST /v1/audio/transcriptions`

Headers:

```text
X-Device-Id: <device-id>
```

Multipart fields:

- `file`
- `model`
- `language?`
- `prompt?`
- `response_format?`
- `temperature?`

Response: OpenAI/Groq-compatible transcription JSON plus `X-Fixvox-*` headers.

## Managed Chat Postprocess

`POST /v1/chat/completions`

Headers:

```text
Content-Type: application/json
X-Device-Id: <device-id>
```

JSON body:

```json
{
  "model": "openai/gpt-oss-120b",
  "messages": [
    { "role": "system", "content": "postprocess prompt" },
    { "role": "user", "content": "raw transcript" }
  ],
  "max_tokens": 512,
  "stream": false
}
```

Response: OpenAI-compatible chat completion JSON (`choices[0].message.content`) plus `X-Fixvox-*` headers.
