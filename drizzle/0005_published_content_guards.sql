CREATE FUNCTION langlab.freeze_release() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Published release is immutable'; END IF;
    IF ROW(NEW.unit_id,NEW.version,NEW.manifest,NEW.manifest_digest,NEW.minimum_app_version,NEW.published_at)
      IS DISTINCT FROM ROW(OLD.unit_id,OLD.version,OLD.manifest,OLD.manifest_digest,OLD.minimum_app_version,OLD.published_at)
      OR NEW.status NOT IN ('published','withdrawn') THEN RAISE EXCEPTION 'Published release is immutable'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER release_immutable BEFORE UPDATE OR DELETE ON langlab.package_releases FOR EACH ROW EXECUTE FUNCTION langlab.freeze_release();

CREATE FUNCTION langlab.freeze_release_link() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE state text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    SELECT status INTO state FROM langlab.package_releases WHERE id=OLD.release_id FOR SHARE;
    IF state <> 'draft' THEN RAISE EXCEPTION 'Published package links are immutable'; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT status INTO state FROM langlab.package_releases WHERE id=NEW.release_id FOR SHARE;
    IF state <> 'draft' THEN RAISE EXCEPTION 'Published package links are immutable'; END IF;
    RETURN NEW;
  END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER package_assets_immutable BEFORE INSERT OR UPDATE OR DELETE ON langlab.package_assets FOR EACH ROW EXECUTE FUNCTION langlab.freeze_release_link();
CREATE TRIGGER package_lessons_immutable BEFORE INSERT OR UPDATE OR DELETE ON langlab.package_lessons FOR EACH ROW EXECUTE FUNCTION langlab.freeze_release_link();

CREATE FUNCTION langlab.freeze_asset() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE state text;
BEGIN
  FOR state IN SELECT r.status FROM langlab.package_releases r JOIN langlab.package_assets a ON a.release_id=r.id WHERE a.asset_id=OLD.id FOR SHARE OF r LOOP
    IF state <> 'draft' THEN RAISE EXCEPTION 'Published asset metadata is immutable'; END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER asset_immutable BEFORE UPDATE OR DELETE ON langlab.assets FOR EACH ROW EXECUTE FUNCTION langlab.freeze_asset();
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA langlab FROM PUBLIC;
