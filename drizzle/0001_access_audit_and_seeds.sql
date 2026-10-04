CREATE FUNCTION langlab.deny_audit_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Audit history is append-only'; END;
$$;
CREATE TRIGGER licence_events_immutable BEFORE UPDATE OR DELETE ON langlab.licence_events FOR EACH ROW EXECUTE FUNCTION langlab.deny_audit_mutation();
CREATE TRIGGER admin_events_immutable BEFORE UPDATE OR DELETE ON langlab.admin_audit_events FOR EACH ROW EXECUTE FUNCTION langlab.deny_audit_mutation();

CREATE FUNCTION langlab.freeze_published_lesson() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.published_at IS NOT NULL THEN RAISE EXCEPTION 'Published lesson is immutable'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER published_lesson_immutable BEFORE UPDATE OR DELETE ON langlab.lesson_versions FOR EACH ROW EXECUTE FUNCTION langlab.freeze_published_lesson();

REVOKE ALL ON SCHEMA langlab FROM PUBLIC;
GRANT USAGE ON SCHEMA langlab TO authenticated,service_role;
GRANT SELECT ON langlab.admin_memberships,langlab.admin_roles TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA langlab TO service_role;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA langlab FROM PUBLIC;
INSERT INTO langlab.languages VALUES
('en','English','English'),('hi','Hindi','हिन्दी'),('sa','Sanskrit','संस्कृतम्'),('fr','French','Français'),('de','German','Deutsch');
INSERT INTO langlab.skills VALUES ('listening','Listening'),('speaking','Speaking'),('reading','Reading'),('writing','Writing'),('grammar','Grammar'),('vocabulary','Vocabulary');


