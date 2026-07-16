# Health Module

Owns operational health endpoints for the NestJS process and required runtime
dependencies.

Keep this module technical and small. Health checks may report dependency
availability but must not contain business workflows or expose secrets.
