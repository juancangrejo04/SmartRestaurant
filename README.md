# SmartRestaurant — Plataforma Serverless Distribuida Multinacional

[![Vercel](https://img.shields.io/badge/Vercel-Hobby_Serverless-black.svg)](https://vercel.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL_15+-green.svg)](https://supabase.com/)
[![Upstash](https://img.shields.io/badge/Upstash-QStash_Serverless_Messaging-00E599.svg)](https://upstash.com/)
[![React](https://img.shields.io/badge/React-19_Vite_SPA-blue.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)

---

## 1. Resumen Ejecutivo del Proyecto

**SmartRestaurant** es una plataforma SaaS distribuida multinacional para la gestión completa del flujo gastronómico (reservas, comandas digitales por código QR en mesa, monitor KDS en cocina, entregas de mesero y reseñas de comensales).

Esta versión ha sido adaptada y preparada para ejecutarse de forma **100% serverless en planes gratuitos**:
- **Frontend & API Gateway:** Vercel Hobby (React 19 + TypeScript + Vercel Serverless Functions).
- **Persistencia & Autenticación:** Supabase (PostgreSQL 15+ administrado con Row Level Security y Supabase Auth).
- **Mensajería Asíncrona & Webhooks:** Upstash QStash (distribución de eventos sin servidores persistentes, reintentos con backoff exponencial, deduplicación y verificación de firma criptográfica).
- **Accesibilidad Pública:** Desplegable públicamente en Vercel, accesible desde cualquier dispositivo y país sin depender de que tu computadora esté encendida ni de contenedores locales.

> **Claridad Arquitectónica:** No se afirma que existan servidores físicos independientes. El sistema implementa siete (7) servicios de dominio lógicos independientes mediante **Funciones Serverless en Vercel** bajo `/api/*`, con validaciones, controladores y lógica de negocio estrictamente desacopladas.

---

## 2. Los Siete Dominios Lógicos Serverless

| Dominio | Endpoint Serverless | Responsabilidades de Negocio | Eventos QStash |
|---|---|---|---|
| **Auth Service** | `/api/auth` | Registro, login, recuperación de contraseña, hash Bcrypt y control RBAC (5 roles). | - |
| **Restaurant Service** | `/api/restaurants` | Restaurantes multi-tenant (5 países), sedes, mesas, menús QR y opiniones. | - |
| **Reservation Service** | `/api/reservations` | Disponibilidad con prevención ACID de solapes (409 Conflict) y outbox. | `ReservationCreated`, `ReservationCancelled` |
| **Order Service** | `/api/orders` | Pedidos QR, cálculo seguro de precios e impuestos en backend e idempotencia. | `OrderCreated`, `OrderUpdated` |
| **Kitchen Service** | `/api/kitchen` | Fila KDS en tiempo real, máquina de estados finita y cronómetros. | `KitchenOrderAccepted`, `KitchenOrderCompleted` |
| **Notification Service** | `/api/notifications` | Alertas operativas para meseros/cocina y suscriptor webhook de eventos. | `NotificationRequested` |
| **Analytics Service** | `/api/analytics` | KPIs de facturación, rotación de mesas y motor de recomendaciones. | - |
| **QStash Receiver** | `/api/events/qstash-receiver` | Verificación de firma criptográfica y procesamiento con control de duplicados. | - |

---

## 3. Soporte Internacional (5 Países, Idiomas y Monedas Nativas)

La aplicación preserva el 100% de la internacionalización en todos los flujos y pantallas:
1. 🇨🇴 **Colombia:** `es-CO`, Moneda `COP`, Zona `America/Bogota` (UTC-5).
2. 🇲🇽 **México:** `es-MX`, Moneda `MXN`, Zona `America/Mexico_City` (UTC-6).
3. 🇺🇸 **Estados Unidos:** `en-US`, Moneda `USD`, Zona `America/New_York` (UTC-5).
4. 🇧🇷 **Brasil:** `pt-BR`, Moneda `BRL`, Zona `America/Sao_Paulo` (UTC-3).
5. 🇯🇵 **Japón:** `ja-JP`, Moneda `JPY`, Zona `Asia/Tokyo` (UTC+9) con caracteres kanji/kana auténticos.

---

## 4. Guía de Configuración para Despliegue Público Gratuito

### Paso 1: Configurar Proyecto en Supabase (Plan Gratuito)
1. Ingresa a [supabase.com](https://supabase.com/) e inicia sesión o crea una cuenta gratuita.
2. Crea un nuevo proyecto (ej. `smartrestaurant-prod`). Elige la región geográfica más cercana a tus usuarios.
3. Ve al **SQL Editor** en la barra lateral izquierda.
4. Abre el archivo provisto en el repositorio: `supabase/migrations/20261102000000_smartrestaurant_schema.sql`.
5. Copia todo su contenido, pégalo en el SQL Editor de Supabase y presiona **Run**. Esto creará todas las tablas (`tenants`, `branches`, `restaurant_tables`, `menu_categories`, `menu_items`, `users`, `reservations`, `orders`, `order_items`, `reviews`, `notifications`, `outbox_events`, `processed_events`), índices y políticas de Row Level Security (RLS).
6. Dirígete a **Project Settings > API** y copia:
   - **Project URL** (`SUPABASE_URL`)
   - **anon / public key** (`SUPABASE_ANON_KEY`)
   - **service_role key** (`SUPABASE_SERVICE_ROLE_KEY`) *(Guárdala en secreto; solo la usará el backend serverless de Vercel)*.

---

### Paso 2: Configurar Mensajería en Upstash QStash (Plan Gratuito)
1. Ingresa a [upstash.com](https://upstash.com/) y crea una cuenta gratuita.
2. En la consola principal, ve a la pestaña **QStash**.
3. En la sección **REST API / Keys**, copia:
   - **QSTASH_TOKEN**
   - **QSTASH_CURRENT_SIGNING_KEY**
   - **QSTASH_NEXT_SIGNING_KEY**

---

### Paso 3: Conectar Repositorio con Vercel Hobby (Plan Gratuito)
1. Sube el código fuente de tu repositorio a GitHub (ej. `github.com/tu-usuario/smartrestaurant`).
2. Ingresa a [vercel.com](https://vercel.com/) e inicia sesión con GitHub.
3. Haz clic en **Add New... > Project** e importa el repositorio de SmartRestaurant.
4. En la configuración del proyecto:
   - **Framework Preset:** `Vite`
   - **Build Command:** `vite build`
   - **Output Directory:** `dist`
5. En la sección **Environment Variables**, agrega las variables con los valores obtenidos de Supabase y Upstash:

| Nombre de la Variable | Descripción | Ejemplo / Origen |
|---|---|---|
| `SUPABASE_URL` | URL de la API de tu proyecto Supabase | `https://xyzprojectid.supabase.co` |
| `SUPABASE_ANON_KEY` | Clave pública anónima de Supabase | `eyJhbGciOi...` (Supabase Dashboard) |
| `SUPABASE_SERVICE_ROLE_KEY`| Clave de servicio privada de Supabase (Backend) | `eyJhbGciOi...` (Supabase Dashboard) |
| `QSTASH_TOKEN` | Token para publicar mensajes en Upstash | `eyJVc2Vy...` (Upstash Console) |
| `QSTASH_CURRENT_SIGNING_KEY`| Clave para validar firma criptográfica | `sig_...` (Upstash Console) |
| `QSTASH_NEXT_SIGNING_KEY` | Clave siguiente para rotación de secretos | `sig_...` (Upstash Console) |
| `APP_BASE_URL` | URL pública de tu app en Vercel | `https://smartrestaurant-tu-app.vercel.app` |
| `JWT_SECRET` | Secreto para firma de tokens JWT | Cadena segura de más de 32 caracteres |

6. Haz clic en **Deploy**. Vercel compilará la SPA estática y generará automáticamente las funciones serverless bajo `/api/*`.

---

## 5. Ejecución en Modo Local / Desarrollo

Para ejecutar y probar la aplicación en tu entorno local (incluyendo AI Studio):

```bash
# 1. Instalar dependencias
npm install

# 2. Copiar y configurar variables de entorno
cp .env.example .env

# 3. Ejecutar las pruebas automatizadas (10 suites)
npm test

# 4. Iniciar el servidor local de desarrollo (conecta API serverless y Vite SPA en el puerto 3000)
npm run dev
```

La aplicación abrirá en `http://localhost:3000`.

---

## 6. Resultados Reales de las Pruebas Automatizadas

El comando `npm test` ejecuta `tests/serverless_distributed_tests.ts`. A continuación se reporta la ejecución verificada en la terminal:

```
========================================================================
🚀 EJECUTANDO SUITE COMPLETA DE PRUEBAS SERVERLESS — SMARTRESTAURANT
Arquitectura: Vercel Functions + Supabase PostgreSQL + Upstash QStash
========================================================================

--- 1. Registro, Autenticación Real y Hash Bcrypt ---
✅ [PASS]: Autenticación y firma JWT validadas.

--- 2. Autorización por Roles (RBAC: 5 Roles) ---
✅ [PASS]: Control de roles RBAC validado para los 5 perfiles.

--- 3. Aislamiento Multi-Tenant Estricto ---
✅ [PASS]: Aislamiento multi-tenant validado.

--- 4. Persistencia Relacional y Transacciones ACID ---
✅ [PASS]: Integridad transaccional y persistencia verificadas.

--- 5. Prevención de Reservas Simultáneas Incompatibles (Concurrencia) ---
✅ [PASS]: Motor de reservas con control de concurrencia y cancelación validado.

--- 6. Idempotencia y Cálculo de Precios de Pedidos en Backend ---
✅ [PASS]: Cálculo seguro de precios e idempotencia validados.

--- 7. Máquina de Estados Finita de Cocina (KDS) ---
✅ [PASS]: Transiciones de cocina y mesa controladas correctamente.

--- 8. Publicación de Eventos a Upstash QStash & Transactional Outbox ---
✅ [PASS]: Integración de Upstash QStash y Transactional Outbox validada.

--- 9. Verificación de Firmas QStash y Procesamiento Idempotente de Webhooks ---
✅ [PASS]: Verificación de firma y control de duplicados en webhook completados.

--- 10. Internacionalización Completa (5 Países, Idiomas y Monedas) ---
✅ [PASS]: Internacionalización en los 5 mercados verificada al 100%.

========================================================================
🎉 TODAS LAS 10 SUITES DE PRUEBAS SERVERLESS PASARON CON 100% DE ÉXITO
========================================================================
```

---

## 7. Usuarios y Roles de Demostración

| Rol | Usuario | Email de Prueba | Alcance Operativo |
|---|---|---|---|
| **Propietario (Owner)** | Carlos Mendoza | `owner@andres.co` | Control ejecutivo multi-sede, configuración de catálogos, auditoría serverless e informes. |
| **Administrador (Admin)** | Valeria Gómez | `admin@andres.co` | Gestión de reservas, mesas autorizadas, catálogo y auditoría operativa. |
| **Mesero (Waiter)** | Mateo Restrepo | `waiter@andres.co` | Consulta de mesas asignadas, toma de comanda y entrega con botón "Marcar como entregado". |
| **Cocina (Kitchen)** | Chef Andrés Parra | `kitchen@andres.co` | Tablero KDS, cronometraje de platos y avance de estados. |
| **Cliente (Customer)** | Sofía Caballero | `customer@gmail.com` | Menú por código QR, reservas digitales, seguimiento en vivo y reseñas. |

---

## 8. Estado de las Funcionalidades

- [x] **Vercel Hobby:** Configurado con `vercel.json`, enrutamiento serverless `/api/*` y hosting SPA de alto rendimiento.
- [x] **Supabase PostgreSQL:** Esquema relacional completo, claves foráneas, restricciones de unicidad, RLS y migraciones versionadas.
- [x] **Upstash QStash:** Reemplazo integral de RabbitMQ con publicación HTTP, deduplicación, reintentos y verificación de firmas criptográficas.
- [x] **Transactional Outbox:** Registro atómico en base de datos previo a la entrega del evento.
- [x] **5 Idiomas y Monedas:** Soporte nativo para Colombia (`COP`), México (`MXN`), EE.UU. (`USD`), Brasil (`BRL`) y Japón (`JPY`).
- [x] **Ciclo de Pedidos y Entrega:** Creación por QR, transición en monitor de cocina KDS, alertas para meseros y entrega a mesa.
- [x] **Módulo de Reseñas:** Formulario de calificación y visualización en todas las sedes internacionales.
- [x] **Cero Procesos Permanentes Obligatorios:** No requiere que la máquina local esté encendida ni exige Docker en producción.
