# Lumen ✦ tu vida en orden

App web instalable (PWA) para organizar pagos, citas, trabajo, rituales y notas.
Sin build, sin dependencias: HTML + CSS + un archivo JS.

**Funciona sola** (guarda en tu celular) y **opcionalmente se sincroniza** con una base de datos gratis (Supabase) para tener tus datos en todos tus aparatos y poder automatizar cosas desde afuera.

## 1. Publicar en GitHub Pages (5 min)

1. Crea un repo nuevo en GitHub (por ejemplo `lumen`) y sube estos archivos a la raíz:
   `index.html`, `app.js`, `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`
2. En el repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)` → Save**.
3. En ~1 minuto queda en `https://TU-USUARIO.github.io/lumen/`.

## 2. Instalarla en el celular

- **iPhone (Safari):** abre la URL → botón Compartir → **Añadir a pantalla de inicio**.
- **Android (Chrome):** menú ⋮ → **Instalar app**.

Abre como app de pantalla completa y funciona sin internet.

## 3. Conectar la base de datos (Supabase, gratis)

1. Crea un proyecto en https://supabase.com
2. En **SQL Editor** pega y ejecuta:

```sql
create table public.life_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.life_data enable row level security;

create policy "solo mi fila" on public.life_data
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

3. En **Project Settings → API** copia la **Project URL** y la **anon public key**.
   (La anon key es pública por diseño; la seguridad la da la política de arriba: cada cuenta solo ve su fila.)
4. *(Recomendado)* **Authentication → Providers → Email**: desactiva "Confirm email" si quieres entrar de inmediato.
5. En Lumen: ícono de ajustes (arriba a la derecha) → pega URL y key → correo y contraseña → **Crear cuenta**.
   El punto del ícono se pone verde cuando está sincronizado.

Tus datos se guardan como un documento JSON por usuario. Cada elemento tiene fecha de modificación y gana el más reciente, así que puedes usar el celular y la compu a la vez sin pisarte.

## 4. Cómo escribirle

En el botón **+** escribe como hablas:

| Escribes | Entiende |
|---|---|
| `pagar luz 45 el 25 cada mes` | Pago de $45, día 25, se repite mensual |
| `cita dentista mañana 3pm` | Cita, mañana, 15:00 |
| `reunión con cliente viernes 4 de la tarde` | Trabajo, viernes, 16:00 |
| `gym cada lunes 7 de la mañana` | Semanal, lunes, 07:00 |
| `cumple de Sofi el 3 de marzo` | Cita el 3 de marzo |

Si ya escribiste algo antes (por ejemplo "Pagar agua"), recuerda su monto, categoría y repetición.
Al completar algo que se repite, crea solo el siguiente.

## Qué trae (versión 2)

| Herramienta | Dónde | Para qué |
|---|---|---|
| **★ Lo importante** | Estrella en cada tarea; sección arriba en Hoy | Tu foco del día. También con la palabra "importante" o "urgente" al escribir |
| **Enfoque** | Botón ⏱ de la cabecera | Temporizador de 15/25/45/60 min para una sola cosa; sigue corriendo si cierras la app |
| **Pasos** | Al editar una tarea | Mini-checklist dentro de la tarea (se ve como ✓ 2/4) |
| **Check-in** | Hoy | Ánimo y energía del día. En Mente ves 14 días y un patrón (por ejemplo, tu ánimo vs. tus rituales) |
| **Gastos e ingresos** | Dinero | Anota en segundos; adivina la categoría y recuerda montos repetidos. Calcula cuánto **te queda libre** |
| **Presupuesto** | Ajustes | Cuánto te queda por día para gastar este mes |
| **Metas** | Mente | Por porcentaje o por número (ahorro, km, libros) con el ritmo semanal que necesitas |
| **Gente** | Mente | A quién llevas tiempo sin escribirle, con cumpleaños anual automático en la agenda |
| **Revisión semanal** | Mente (y aviso en Hoy los domingos y lunes) | Resumen de tu semana y 3 preguntas; tu respuesta se vuelve tarea importante |
| **Deshacer** | Al borrar o completar | Aparece un botón durante 6 segundos |
| **Sin fecha** | Hoy | Las tareas sin fecha ya no se pierden |

## Si ya tenías Lumen publicado

No hay que tocar la base de datos. Reemplaza en tu repo **`index.html`**, **`app.js`** y **`sw.js`** (el resto no cambió).
Abre la app en cada aparato una vez con internet para que se actualice.
Tus datos anteriores se conservan; las secciones nuevas empiezan vacías.

## 5. Automatizar desde afuera (siguiente nivel)

Como todo vive en la tabla `life_data`, puedes leerla con un script (Python, por ejemplo) y mandarte avisos reales
al celular por Telegram/WhatsApp con un cron gratis en GitHub Actions. Los avisos nativos del navegador solo
saltan cuando abres la app; para avisos con la app cerrada necesitas ese script o un servidor de Web Push.

## Respaldo

Ajustes → **Respaldo** descarga un JSON. **Exportar al calendario** genera un `.ics` para Google/Apple Calendar.
