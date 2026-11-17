-- Private athlete-media objects are accessible only to signed-in organization members
-- who pass the existing organization and athlete checks in USING/WITH CHECK.
ALTER POLICY "org members read private athlete media"
  ON storage.objects TO authenticated;

ALTER POLICY "org members upload private athlete media"
  ON storage.objects TO authenticated;

ALTER POLICY "org members delete private athlete media"
  ON storage.objects TO authenticated;
