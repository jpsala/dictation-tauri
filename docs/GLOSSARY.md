# Glosario

Aliases y terminos recurrentes del proyecto.

| Termino | Significado |
| --- | --- |
| Dictation Tauri | Nombre operativo del proyecto en `C:\dev\dictation-tauri`. |
| Nuestro proyecto | Alias conversacional para Dictation Tauri, el repo actual en `C:\dev\dictation-tauri`. |
| Proyecto canonico | Fixvox en `C:\dev\electro-bun-1`. Fuente de verdad sobre lo que funciona hoy en dictado, runtime de voz, backend/proxy, policies, variables de entorno, benchmarks y aprendizajes de producto. No se porta literal ni se copia su arquitectura Electrobun/Bun. |
| Proyecto Tauri | `C:\dev\chat\copyq-tauri`. Fuente de verdad tecnica moderna para stack Tauri, ventanas, custom chrome, superficies, Mantine, temas, settings, global shortcuts, tray, foco/paste en Windows, checks visuales y estructura de app desktop. |
| CopyQ Tauri / Copicu | Nombre del proyecto Tauri de referencia en `C:\dev\chat\copyq-tauri`. |
| Fixvox | Nombre del proyecto canonico en `C:\dev\electro-bun-1`. |
| AOS | Agentic OS (AOS), sistema liviano de memoria, docs, topics, specs y skills. |
| Working Memory | `docs/WORKING_MEMORY.md`, estado vivo y corto del proyecto. |
| Topic | Documento recuperable en `docs/topics/` con frontmatter y triggers. |
| Track | Trabajo vivo retomable en `docs/tracks/`, con YAML validado. |
| Task | Unidad de trabajo dentro de SpecKit o `tasks.md`; no usar como carpeta de continuidad viva. |
| Active Work | Alias historico de Track; usar `docs/tracks/` en docs nuevas. |
| Archive | `docs/tracks/archive/`, carpeta de tracks cerradas con `status: archived`. |
| Context Index | `docs/.generated/context-index.md`, cache generado de topics, tracks, specs, skills y aliases. |
| SpecKit | Flujo de specs, planes y tasks para features grandes. |
| Port foundation | Spec draft `specs/001-port-foundation/`, base inicial del port Tauri. |
| Datos de dictado | Audio, transcripciones, prompts, logs, correcciones y metadata de captura de voz. |
| Local Skill | Skill local portable versionada dentro del repo. |
| Skills Canonicas | Carpeta `docs/skills/`, fuente de verdad de las skills locales. |
| Skills Compat | `.agents/skills`, junction/toggle de compatibilidad hacia `docs/skills/`. |
| Small Batch | Unidad de trabajo agentico chica, revisable y reversible: una task SpecKit, un comportamiento observable o una sincronizacion documental acotada, cerrada con checks y commit atomico. |
| Context Bloat / Contaminacion De Contexto | Cuando reglas, memoria viva, topics o tracks crecen hasta volverse lectura obligatoria amplia y degradan la capacidad de una sesion nueva. |
