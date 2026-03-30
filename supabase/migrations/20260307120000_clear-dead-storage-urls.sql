-- Clear all storage URLs that point to files from the deleted old project.
-- The old project (jqynxytwngtytvuzucuo) was deleted and its storage is gone.
-- The import script rewrote URLs to the new project ref, but files were never transferred.
-- This sets broken URLs to NULL so the UI shows placeholders instead of broken images.

-- Profiles: avatar and cover images
UPDATE profiles SET avatar = NULL WHERE avatar IS NOT NULL;
UPDATE profiles SET cover_image = NULL WHERE cover_image IS NOT NULL;

-- Associations: logo and cover image
UPDATE associations SET logo = NULL WHERE logo IS NOT NULL;
UPDATE associations SET cover_image = NULL WHERE cover_image IS NOT NULL;

-- Companies: logo
UPDATE companies SET logo = NULL WHERE logo IS NOT NULL;

-- Posts: images, videos, documents
UPDATE posts SET image_url = NULL WHERE image_url IS NOT NULL;
UPDATE posts SET video_url = NULL WHERE video_url IS NOT NULL;
UPDATE posts SET document_url = NULL WHERE document_url IS NOT NULL;

-- Events: thumbnails and link preview images
UPDATE events SET thumbnail_url = NULL WHERE thumbnail_url IS NOT NULL;
UPDATE events SET link_preview_image = NULL WHERE link_preview_image IS NOT NULL;

-- Certifications: uploaded certificate files
UPDATE certifications SET certificate_file_url = NULL WHERE certificate_file_url IS NOT NULL;

-- Key functionaries: photo
UPDATE key_functionaries SET photo = NULL WHERE photo IS NOT NULL;

-- Messages: attachments JSON may contain storage URLs
-- Set to NULL where attachments contain the old/new supabase storage domain
UPDATE messages SET attachments = NULL
WHERE attachments IS NOT NULL
AND attachments::text LIKE '%supabase.co/storage%';
