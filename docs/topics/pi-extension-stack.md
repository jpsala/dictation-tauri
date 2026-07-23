---
id: pi-extension-stack
status: active
kind: reference
triggers:
  - extensiones pi
  - paquetes pi
  - pi packages
  - sincronizar pi
  - web_search
  - codemapper
  - fff
  - advisor
  - pi-lens
  - image_generate
  - subagentes
primary_refs:
  - C:/Users/jpsal/.pi/agent/settings.json
  - C:/dev/os/docs/reference/pi-extension-stack-inventory.md
  - C:/dev/os/runtime/aos-flujo.ts
  - aos.requirements.json
  - docs/topics/pi-agentic-os.md
  - docs/topics/agent-tool-routing.md
---

# Pi Extension Stack

El inventario global vive en
`C:/dev/os/docs/reference/pi-extension-stack-inventory.md`. Dictation Tauri no
duplica esa configuración: declara el contrato requerido y conserva sólo
adapters locales con comportamiento específico del proyecto.

## Superficie Operativa

| Capacidad | Uso |
| --- | --- |
| `/flow` global | Pensar, Planear, abrir el handoff de Hacer o Cerrar. |
| CodeMapper/FFF | Orientación, símbolos, relaciones y búsqueda local. |
| `ask_user` / `advisor` | Decisiones humanas y segundo juicio. |
| `lens_diagnostics` / LSP | Feedback técnico después de tocar código. |
| Web/librarian | Documentación, releases e internals externos; nunca secretos. |
| `Agent` | Sólo pedidos explícitos fuera del camino normal de Hacer. |
| Chrome/CUA/image generation | UI explícita con aviso y guardrails del proyecto. |
| Footer/context viewer/tool display | UX global de Pi; no es dependencia del producto. |

Taskflow, Council, planner, until-done, dgoal y Governed Runner no forman parte
del runtime AOS vigente. La ruta de ejecución está en
`docs/topics/agent-tool-routing.md`.

## Reglas

1. Usar la capacidad más chica que cierre el objetivo.
2. No instalar/remover paquetes ni cambiar settings globales sin autorización y
   backup.
3. `/flow` debe aparecer exactamente una vez con provenance `user/package` desde
   `C:/dev/os/runtime/aos-flujo.ts`.
4. `.pi/extensions/aos-flujo.ts` está prohibido; `aos.requirements.json` exige el
   contrato `aos.flow-first@1.1.0`.
5. `/doctor`, índice y audit siguen locales porque validan contexto de este repo.
6. SpecKit e Impeccable permanecen locales y no compiten con `/flow` como entrada
   cotidiana.
7. Browser/CUA/hotkeys/clipboard/apps visibles requieren el aviso inicial; no
   operar cuentas, envíos o datos privados sin confirmación.

## Verificación

```powershell
bun run context:index
bun run check
```

Para cambios del stack global, verificar además desde un proceso Pi fresco que
`get_commands` devuelve un solo `flow`, scope `user`, origin `package` y source
`C:/dev/os/runtime/aos-flujo.ts`.
