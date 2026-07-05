# Projects Module

Owns project drafts, owner-reviewed metadata, publication, visibility, and
discovery data.

Use this module for:

- Creating a project draft from normalized GitHub repository data.
- Updating owner-editable project metadata.
- Publishing and archiving projects.
- Listing/searching published projects.

This module stores repository references and normalized metadata. It must not
own or expose GitHub access tokens.

Implemented endpoints:

- `POST /projects/import/github`

`POST /projects/import/github` is owner/admin-only. It asks the GitHub module
for a normalized repository snapshot from the connected account, then creates or
refreshes a draft `Project`.
