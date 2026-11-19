# HF Coach — control de acceso RBAC

## Objetivo

Separar autorización en tres perfiles: administrador de organización, coach y atleta vinculado. El navegador solo presenta la interfaz; las decisiones de acceso se toman en PostgreSQL mediante RLS y funciones validadas desde Edge Functions.

## Modelo de identidad

- **Administrador:** fila `organization_memberships` con rol `admin`. Puede administrar membresías, coaches, invitaciones, asignaciones y calendario organizacional.
- **Coach:** fila `organization_memberships` con rol `coach`. Puede crear y administrar fichas propias y fichas asignadas mediante `coach_athletes`.
- **Atleta:** no recibe rol de organización. Su acceso se deriva de una fila activa en `athlete_accounts`, vinculada a un único `athlete_id` y `organization_id`.

Los permisos de atleta no se deducen de `user_metadata` ni de datos enviados por el cliente.

## Reglas centrales

| Operación | Admin | Coach | Atleta |
|---|---|---|---|
| Ver y administrar roster de coaches | Sí | Solo su propio perfil | No |
| Crear, revocar o listar invitaciones | Sí | No | No |
| Ver todas las membresías de organización | Sí | Solo su propia membresía | No |
| Ver atletas | Toda la organización | Propios y asignados | Solo su ficha |
| Crear ficha deportiva | Para sí o delegada a un coach vigente | Para sí mismo | No |
| Editar ficha/plan/mediciones/evaluaciones | Toda la organización | Propios y asignados | Solo datos personales pendientes de validación |
| Asignar coaches | Sí | No; solo conserva una asociación propia de alta | No |
| Crear o modificar calendario de competencias | Sí | No | No |
| Registrar resultados de atletas | Sí | Propios y asignados | No |
| Leer biblioteca de ejercicios | Sí | Sí, dentro de organización y catálogo del sistema | Sí, biblioteca aplicable |
| Modificar biblioteca organizacional | Sí | No | No |
| Consultar medios privados | Toda la organización | Medios de atletas propios/asignados | Solo sus medios |
| Administrar membresías | Sí | No | No |

## Implementación en Supabase

### Funciones auxiliares

Las funciones `is_org_admin`, `is_org_member`, `is_org_coach`, `is_linked_athlete`, `can_manage_athlete` y sus variantes con organización se alojan en el esquema `private`, no expuesto por la Data API. Tienen `search_path = ''`, referencias completamente calificadas y permisos de ejecución para `authenticated` y `service_role`; `anon` no tiene uso del esquema ni ejecución.

`can_manage_athlete` valida que el usuario siga teniendo rol `coach` en la organización del atleta y que sea propietario o tenga una asignación coincidente en `coach_athletes`. Las variantes `*_in_org` verifican además que el atleta pertenezca a la organización indicada.

### Row Level Security y privilegios

- RLS permanece habilitado en las tablas de negocio.
- Las políticas de datos longitudinales usan el par atleta/organización, no solo el UUID del atleta.
- Coaches no pueden leer perfiles de otros coaches ni membresías de otros usuarios.
- Solo administradores pueden modificar membresías y asignaciones entre coaches.
- Se retiraron las políticas de autoasignación de atletas a coaches; se conserva una política limitada necesaria para que `create_athlete_atomic` registre la relación del coach que acaba de crear su propio atleta.
- Competencias y catálogo organizacional se editan solo por admin.
- `storage.objects` valida simultáneamente la carpeta de organización y la del atleta.
- `anon` no tiene privilegios de tabla en el esquema público y `authenticated` solo tiene SELECT/INSERT/UPDATE/DELETE; no TRUNCATE, REFERENCES ni TRIGGER.
- `coach_invitations` sigue siendo solo de `service_role`, con una política explícita de denegación para clientes autenticados.

### Solicitudes de vinculación de atletas

`request-athlete-access` verifica la sesión, el correo confirmado, que el solicitante no tenga ya rol de admin/coach en esa organización y que el destinatario tenga rol estricto `coach`.

`approve-athlete-access` valida que el coach destinatario siga activo, que solo él pueda aprobar si no es admin y que la ficha pertenezca a su grupo. La asignación, el vínculo de cuenta y el cambio de estado se realizan con `approve_athlete_access_request` dentro de una sola transacción.

### Funciones de servidor

- `create-coach-invitation`: solo admin de la organización.
- `manage-coach-invitations`: solo admin de la organización.
- `request-athlete-access`: solo cuenta de atleta no miembro.
- `approve-athlete-access`: admin o coach destinatario, con los límites de propiedad anteriores.
- `accept-coach-invitation`: acepta el token propio de HF Coach; no asigna roles de organización distintos del rol fijo `coach`.

Las Edge Functions que usan `service_role` verifican la sesión con `auth.getUser()` y revalidan el rol/organización en servidor antes de escribir.

## Pruebas realizadas

Pruebas realizadas con sesiones SQL simuladas como `authenticated`, con `auth.uid()` configurado para cada usuario; las pruebas de escritura se ejecutaron en transacciones revertidas.

| Prueba | Resultado |
|---|---|
| Admin ve 2 atletas, 2 perfiles coach y 3 membresías | PASS |
| Admin gestiona ambos atletas y delega alta a otro coach | PASS |
| Gabriela ve sus 2 atletas, solo su perfil y su membresía | PASS |
| Segundo coach sin asignaciones ve 0 atletas y no gestiona atletas de Gabriela | PASS |
| Coach no accede a una organización distinta | PASS |
| Coach no inserta medición validada sobre atleta de otro coach | Denegado por RLS |
| Coach no crea evento del calendario organizacional | Denegado por RLS |
| Coach no se autoasigna un atleta de otro coach | Denegado por RLS |\n| Coach intenta solicitar acceso de atleta para su propia cuenta | Denegado por RLS |\n| Admin crea un evento del calendario organizacional | PASS, con ROLLBACK |
| Coach no lee el perfil de otro coach | 0 filas |
| Coach no cambia membresías | 0 filas afectadas |
| Coach actualiza medición de su atleta | PASS |\n| Admin asigna una ficha a otro coach: el coach asignado puede gestionarla y un coach no asignado no la ve | PASS, con ROLLBACK |
| Coach crea ficha propia mediante `create_athlete_atomic` | PASS |
| Admin crea ficha delegada a un coach vigente | PASS |
| Atleta ve solo su ficha y puede enviar medición pendiente de validación | PASS |
| TRUNCATE y TRIGGER para authenticated | Denegados |
| Funciones auxiliares fuera de public y sin ejecución anon | PASS |
| Datos existentes luego de pruebas | 2 atletas, 2 asignaciones, 4 mediciones, 4 marcas |

Las pruebas negativas se observaron como errores RLS 42501 en inserciones, o como cero filas para SELECT/UPDATE filtrados. Las pruebas positivas de escritura finalizaron con ROLLBACK para no dejar registros de prueba. Se verificó además que el esquema `private` no tiene USAGE para `anon`, y que las funciones auxiliares ya no existen bajo nombres RPC públicos.

## Pendiente de validación operativa

La base de datos y Edge Functions ya fueron probadas con sesiones simuladas. Falta validar desde los tres clientes reales: administrador web, coach web/Android y una cuenta de atleta vinculada. En particular, confirmar que el coach pueda crear/planificar/evaluar sus atletas, que el segundo coach no vea esos datos, y que el atleta pueda consultar y enviar datos pendientes.

El asesor de seguridad de Supabase ya no reporta funciones SECURITY DEFINER expuestas en el esquema público. Permanece un aviso separado: protección contra contraseñas filtradas desactivada en Auth, que debe activarse desde la configuración de Auth.
