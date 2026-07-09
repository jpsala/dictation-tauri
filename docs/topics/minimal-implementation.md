---
id: minimal-implementation
status: active
kind: how-to
triggers:
  - ponytail
  - minimal implementation
  - implementacion minima
  - solucion minima
  - yagni
  - over-engineering
  - bloat
  - boilerplate
  - dependencias innecesarias
  - diff minimo
  - revisar complejidad
primary_refs:
  - docs/topics/agentic-os.md
  - docs/topics/agentic-os-operations.md
  - docs/DECISIONS.md
---

# Implementacion Minima Y Ponytail

AOS puede usar disciplina minimalista para implementar o revisar codigo, pero no la convierte en gobierno obligatorio del sistema.

## Regla Canonica

AOS gobierna contexto, memoria durable, continuidad, specs, TDD, verificaciones, ask-before y seguridad downstream. La disciplina minimalista gobierna solo la forma de implementar una solucion una vez entendido el flujo.

Antes de escribir codigo, preferir en este orden:

1. No construir si la necesidad es especulativa.
2. Reusar helpers, tipos, patrones o comandos existentes en el repo.
3. Usar stdlib.
4. Usar capacidades nativas de la plataforma.
5. Usar dependencias ya instaladas.
6. Resolver con una linea o el diff mas chico si sigue siendo correcto.
7. Solo entonces escribir codigo nuevo minimo.

La escalera corre despues de leer el contexto necesario. Un diff chico en el lugar equivocado no es una mejora.

## Ponytail

Ponytail (`DietrichGebert/ponytail`) queda aprobado como capacidad opcional / herramienta bajo demanda para implementacion y review minimalista.

Uso recomendado:

- bugs y fixes con root cause compartida;
- refactors pequenos;
- reviews de over-engineering;
- reduccion de dependencias, wrappers, boilerplate o abstracciones especulativas;
- auditorias read-only del tipo "que podemos borrar/simplificar".

No usarlo como regla obligatoria always-on en AOS ni en repos downstream. No instalar paquetes globales ni agregar Ponytail como dependencia local salvo pedido explicito. Si se instala en Pi u otro harness, debe poder apagarse y no debe reemplazar el playbook local.

## No Recortar

Nunca simplificar quitando:

- validacion en limites de confianza;
- manejo de errores que evita perdida de datos;
- seguridad;
- accesibilidad basica;
- verificaciones necesarias para logica no trivial;
- memoria durable, topics, tracks o docs necesarios para continuidad AOS;
- requisitos explicitamente pedidos por JP o por una spec aceptada.

## Uso En Este Repo

Aplicar como politica liviana subordinada a AOS: ayuda a elegir el diff mas chico correcto para Dictation Tauri, pero no autoriza saltar specs, permisos, smokes desktop ni reglas de datos de dictado cuando correspondan.
