-- Attachment-only Message commands use an empty string body. The service
-- still requires either a non-empty body or at least one bound attachment.
ALTER TABLE "Message"
  DROP CONSTRAINT "Message_body_length";

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_body_length"
  CHECK (char_length("body") BETWEEN 0 AND 4000);
