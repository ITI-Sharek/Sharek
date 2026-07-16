# Applications Module

Planned owner for contributor applications, eligibility results, and application
status transitions.

Use a controller/service/DTO structure. Request task and skill information
through exported services. The applications service owns authorization, duplicate
checks, status transitions, and final decisions. AI can recommend eligibility but
cannot write application state.
