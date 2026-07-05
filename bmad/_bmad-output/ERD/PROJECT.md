# Entity: PROJECT

## Description
Represents an open-source project published on Share-k. Project owners import projects by providing a GitHub repository URL; the system auto-fetches metadata (title, description, languages, tags, statistics) which the owner reviews and edits before publishing. Published projects become discoverable by contributors and can have contribution requests attached.

## Attributes

| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `id` | UUID | PK, NOT NULL, AUTO-GENERATED | Unique identifier |
| `owner_id` | UUID | FK → USER.id, NOT NULL | The project owner |
| `title` | VARCHAR(255) | NOT NULL | Project name (auto-fetched from GitHub, editable) |
| `description` | TEXT | NULLABLE | Project description (auto-fetched, editable) |
| `github_repo_url` | VARCHAR(500) | UNIQUE, NOT NULL | Full GitHub repository URL |
| `github_repo_id` | VARCHAR(50) | NULLABLE | GitHub's internal repository ID |
| `languages` | JSONB | NULLABLE | Programming languages with percentages, e.g. `{"JavaScript": 60, "Python": 40}` |
| `tags` | JSONB | NULLABLE | Technology tags, e.g. `["react", "fastapi", "docker"]` |
| `technologies` | JSONB | NULLABLE | Detected technology stack beyond languages |
| `repo_statistics` | JSONB | NULLABLE | Stars, forks, open issues, watchers, etc. |
| `category` | ENUM | NULLABLE | One of: `web`, `mobile`, `ai_ml`, `devops`, `tools_utilities` |
| `difficulty` | ENUM | NULLABLE | One of: `beginner`, `intermediate`, `advanced` |
| `status` | ENUM | NOT NULL, DEFAULT `draft` | One of: `draft`, `published`, `archived` |
| `readme_content` | TEXT | NULLABLE | Cached README.md content for RAG indexing |
| `published_at` | TIMESTAMP | NULLABLE | When the owner confirmed publication |
| `created_at` | TIMESTAMP | NOT NULL, AUTO-GENERATED | Record creation time |
| `updated_at` | TIMESTAMP | NOT NULL, AUTO-UPDATED | Last modification time |

## Indexes

| Index Name | Columns | Type | Purpose |
|-----------|---------|------|---------|
| `pk_project` | `id` | PRIMARY KEY | Row identity |
| `uq_project_repo_url` | `github_repo_url` | UNIQUE | Prevent duplicate project imports |
| `idx_project_owner` | `owner_id` | B-TREE | Find projects by owner |
| `idx_project_status` | `status` | B-TREE | Filter published vs. draft |
| `idx_project_category` | `category` | B-TREE | Discovery filter |
| `idx_project_difficulty` | `difficulty` | B-TREE | Discovery filter |
| `idx_project_published` | `published_at` | B-TREE | Sort by publication date |

## Relationships

| Related Entity | Relationship | FK Location | Description |
|---------------|-------------|-------------|-------------|
| USER | N:1 | `project.owner_id` → `user.id` | Each project belongs to one owner |
| CONTRIBUTION_REQUEST | 1:N | `contribution_request.project_id` → `project.id` | A project can have many contribution tasks |

## Business Rules

1. **Draft Before Publish**: Projects start as `draft`. The owner reviews auto-fetched metadata and manually confirms publication.
2. **Visibility**: Only `published` projects appear in contributor discovery feeds. `draft` and `archived` projects are hidden from contributors.
3. **Unique Repository**: The same GitHub repository URL cannot be imported twice across the platform.
4. **RAG Indexing**: On publication, project metadata (title, description, languages, tags, README) is indexed into Pinecone for semantic discovery.
5. **Ownership**: Only the project owner (or admin) can edit, publish, or archive a project.
6. **Archive**: Archiving a project hides it from discovery but preserves existing contribution requests and their history.

## Data Flow

```
Owner imports a connected GitHub repository
     ↓
GitHub API Service fetches using encrypted GitHub token: title, description, languages, tags, stats, README
     ↓
PROJECT created with status = 'draft' + auto-populated fields
     ↓
Owner reviews/edits metadata in the UI
     ↓
Owner clicks "Publish" → status = 'published', published_at set
     ↓
RAG indexing triggered → metadata pushed to Pinecone
```

## PRD Traceability

| Functional Requirement | Description |
|----------------------|-------------|
| FR-002 | Owner adds a project using GitHub repo URL |
| FR-003 | Owner reviews and edits auto-fetched metadata |
| FR-034 | System allows submitting a GitHub repo URL |
| FR-035 | System fetches title, description, languages, tags, stats |
| FR-036 | Owner reviews and edits before publication |
| FR-037 | Published projects appear on the projects page |
| FR-038 | Index metadata for keyword filtering and semantic discovery |
| FR-039 | Associate each project with its owning user |
