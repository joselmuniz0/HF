-- Relaciona una evaluación con su video privado y evita asociar archivos de otro atleta.
ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_id_org_athlete_key
  UNIQUE (id, organization_id, athlete_id);

ALTER TABLE public.evaluations
  ADD COLUMN media_asset_id uuid NULL;

ALTER TABLE public.evaluations
  ADD CONSTRAINT evaluations_media_asset_same_athlete_fk
  FOREIGN KEY (media_asset_id, organization_id, athlete_id)
  REFERENCES public.media_assets (id, organization_id, athlete_id)
  ON DELETE SET NULL (media_asset_id);

CREATE INDEX evaluations_media_asset_id_idx
  ON public.evaluations (media_asset_id)
  WHERE media_asset_id IS NOT NULL;
