# ZENOVEL Pharma Services
# Master Architecture & Build Specification

**Document ID:** ZPS-MA-001  
**Version:** 1.1  
**Status:** Revised consolidated implementation baseline — product-owner clarifications incorporated  
**Date:** 13 October 2026  
**Product owner:** ZENOVEL Pharma Services  
**Primary development environment:** VS Code  
**Frontend:** Next.js  
**Backend:** NestJS  
**Database:** PostgreSQL  

> **Authority of this document:** This specification records the currently agreed business, functional, architecture, security, workflow, UI/UX and testing requirements. The coding agent must follow it. It must not silently remove requirements, make unapproved business-policy changes, or proceed beyond the stage explicitly authorized by the product owner. Where a true gap remains, it must document the question and stop the affected work rather than invent a business rule.

---

## Document Control

| Item | Description |
|---|---|
| Purpose | Authoritative design baseline for the ZENOVEL Monitoring & Project Management Platform |
| Intended audience | Product owner, developers, AI coding agents, QA/QMS, validation/testing personnel |
| Controlled inputs | ZENOVEL Monitoring Plan template, Monitoring Delegation Log, Project Tracking Sheet_Zeel.xlsm, and requirements recorded in this specification |
| Change control | Changes to approved requirements must be proposed, explained, approved by the product owner, and recorded with version/change history |
| Development method | One stage at a time, with test evidence, review, defect correction and explicit acceptance before the next stage |
| Compliance statement | Designed to support applicable GxP, data-integrity, electronic-record and electronic-signature controls. The deployed system's compliance depends on intended use, validation, configuration, procedures, infrastructure and operational controls; this document is not a compliance certificate. |

## Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 13 October 2026 | Initial consolidated Master Architecture baseline. |
| 1.1 | 13 October 2026 | Clarifies the five-working-day sponsor-sharing deadline, PM-configurable sponsor/project timeline, no monitor-to-PM SLA, initial departments, strict report-download role allowlist, configurable signature/approval profiles, universal section-level additional information, default tracker sorting, visible/persistent notifications and clear overdue/deviation triggers. |

## How to Use This Specification

1. Treat this file as the canonical source for agreed requirements.
2. Use the stage plan in Section 23. Do not build all modules in one task.
3. For each stage, implement only the approved stage and necessary dependencies.
4. Before coding, inspect the existing repository and report its state. Never overwrite existing work without explaining the impact and obtaining approval.
5. Before each stage, produce a brief implementation plan and identify any requirement conflict. Do not ask again for information already stated here.
6. After implementation, run the tests relevant to the stage, review the actual results, summarize changed files/database migrations/security implications, and stop for user testing and acceptance.
7. If a defect or improvement is found, report its severity, evidence, impact and recommended fix. Obtain approval for changes that alter intended behavior or scope. Routine implementation corrections that preserve this specification can be made within the approved stage.
8. Do not claim a test, validation, security assessment or regulatory compliance activity passed unless evidence was generated and reviewed.

---

# 1. Purpose and Product Scope

ZENOVEL Pharma Services requires a secure, professional, controlled application for managing project initiation, Monitoring Plan Management, visit-wise delegation, monitoring report preparation, review/comment resolution, final approval, sponsor sharing records, CAPA/follow-up and project archival.

ZENOVEL Pharma Services is a general pharma-services company. This application's initial operational scope is the Clinical Research Department (CRD), particularly independent monitoring and audits of clinical trials and bioequivalence (BE) studies. The initial template set contains nine monitoring-report templates. The application must also support the supplied Monitoring Plan (MP) template and Monitoring Delegation Log. The architecture should remain extensible, but GMP-specific workflows are not part of the initial implementation unless separately approved.

The product is not merely an online checklist. It is a role-controlled project, visit, document and review-workflow platform.

## 1.1 In scope

- Individual user identity, authentication, roles, departments and permissions.
- Project creation and assignment by Associate Director GCP.
- PM assignment acceptance and project ownership transfer.
- Project, sponsor, CRO, site/facility and contact records.
- Monitoring Plan Management, MP meeting, attendee management, risk assessment and approval by the respective PM.
- Protocol PDF/Word upload and AI-assisted MP preparation with source evidence and human review.
- Planned visit matrix and visit-specific Primary/Secondary/Backup/Blind/additional monitor assignment.
- Actual visit management and visit-specific report template selection.
- Common structured form/template engine for MP and the nine report templates.
- CRA report authoring, section navigation, conditional questions, additional information fields and autosave.
- PM review, CRA corrections, PM verification, QMS review and Director of Operations final report approval.
- Controlled comments, versioning, change history and audit trail.
- Word/PDF generation, signed/executed file upload, document integrity controls and permissions on downloads.
- Project Tracking Sheet based on the existing Zeel/PM Excel process.
- Dashboard statistics, notifications, configurable working calendar and SLA/aging rules.
- Overdue/deviation flagging, CAPA tracking readiness, sponsor-sharing records and archival.
- Security, validation support, test evidence and change control.

## 1.2 Explicitly out of scope

- **Project contract management is excluded.** Do not create a project-contract repository, contract approval process or contract-management module.
- The system is not intended to capture subject/participant names, subject IDs or other directly identifying participant information in monitoring-report fields.
- Direct sponsor logins are not required for the initial release. PMs share reports and sponsor-safe tracking outputs externally and record the sharing event in the application.
- SMTP/email sending is a future capability. The initial implementation must have visible in-app pop-up/toast notifications and a persistent notification centre, and an architecture that can later support SMTP without redesign.
- Integrated third-party electronic-signature services are not required initially. Controlled in-app signature/approval events and upload of an externally signed MP are required as described below.
- Do not add unrelated TechyPharma products, branding, company material or workflows. This is a ZENOVEL-only application.

---

# 2. Product and Architecture Principles

1. **Preserve the current ZENOVEL operating process.** The PM-facing Project Tracking Sheet should closely reflect the Zeel Excel tracker while automating dates/statuses where possible.
2. **Keep the user experience simple.** Complex controls should be implemented in the backend and exposed through clear, role-specific screens.
3. **Use a common template engine.** The MP and monitoring reports share the same underlying structured form capabilities.
4. **Model data before generating documents.** Word/PDF files are generated views/artifacts, not the internal database schema.
5. **Project → Monitoring Plan → Planned Visit → Actual Visit → Report** is the core business relationship.
6. **Enforce authorization on the server and every protected API/resource.** Hiding a button is not access control.
7. **Never silently overwrite a controlled record.** Use versions, amendments, superseding records or correction events.
8. **Autosave is not a formal version.** Autosave protects work; formal versions capture controlled submission/revision milestones; change history provides field-level traceability.
9. **AI proposes; a qualified user verifies.** AI-generated information must never become accepted MP content or a final record without authorized human decision.
10. **Auditability spans the complete lifecycle.** Include project assignment, template changes, AI actions, edits, reviews, approvals, downloads, exports, sharing, transfer and archival.
11. **Configuration is controlled.** Templates, workflows, visit types, dropdowns, roles, permissions, SLAs and notification rules must be configurable with history and authorization.
12. **Build incrementally.** One phase is implemented and tested at a time, with user acceptance before moving forward.
13. **Do not claim regulatory compliance based on feature presence alone.** Support validation, risk assessment, SOPs, change control and operational evidence.
14. **PostgreSQL is the authoritative persistence layer.** The requirement is that application records and file contents be stored in PostgreSQL, including uploaded and generated documents, unless the product owner later explicitly approves a change to this architecture.

---

# 3. Target Users and Organizational Roles

## 3.1 Associate Director GCP

- Creates new projects.
- Assigns the Project Manager at first level.
- May enter a provisional/initial monitor assignment during project creation.
- Can assign or reassign monitors for individual visit types/visits.
- Has organization-wide project and report-status visibility.
- Can see PM-wise and CRA-wise workload, delays, report progress and project status.
- Can access Project Tracking and authorized report downloads.
- Receives deviation/overdue notifications where defined.

## 3.2 Project Manager (PM)

- Sees only projects within their assigned scope, except where an explicitly granted additional role permits more.
- Accepts project assignment.
- Owns project-level coordination.
- Initiates Monitoring Plan Management, schedules MP meetings, manages attendees, prepares the MP, delegates monitors visit-wise and approves the MP.
- Reviews CRA reports, comments, verifies corrections and sends reports to QMS.
- May download versioned report copies at permitted lifecycle stages.
- Records sponsor-sharing activity and updates controlled tracker milestones.
- Manages follow-up/CAPA workflow as authorized.
- Can transfer a project only when authorized by role; cannot silently change historical ownership.

## 3.3 CRA / Monitor

- Sees only assigned projects/visits/reports.
- Accepts/acknowledges assigned work.
- Prepares assigned reports online in the section-based authoring workspace.
- Can edit within allowed states, respond to PM/QMS comments and resubmit.
- Can view their work and relevant assignment/MP information according to permission.
- **Cannot download monitoring reports from the application.**
- Cannot access the full organization-level Project Tracking Sheet.

## 3.4 QMS / Quality Management System

- Has broad organization-wide visibility comparable to the Associate Director, subject to assigned permission scope.
- Reviews reports after PM verification.
- Adds comments, verifies corrections and completes QMS review.
- Can access Project Tracking, quality/aging information, audit-trail review and authorized downloads.
- Receives deviation and quality notifications.
- May administer controlled business configuration only if separately granted explicit permission; QMS review access alone does not automatically confer system-admin privileges.

## 3.5 Director

- Has broad management visibility comparable to the Associate Director as configured.
- Can review project/report status and relevant records.
- Does not automatically receive the Director of Operations' final-approval permission unless assigned that role.
- Report downloads are not permitted for the Director role by default; the download-authorized roles remain PM, QMS and Associate Director GCP.

## 3.6 Director of Operations

- Has broad management visibility.
- Performs mandatory final approval of the exact final report version.
- Approval is a controlled signature/approval event and must not be bypassable through the ordinary workflow.
- Does not have report-download permission by default; report download remains limited to PM, QMS and Associate Director GCP.

## 3.7 System Administrator

- Manages technical configuration, user lifecycle, role assignment, permissions and security settings as authorized.
- Cannot silently edit report contents, remove history or approve a report solely by virtue of system-admin status.
- Privileged actions are audited.

## 3.8 Business/Quality Configuration Administrator

- Can configure templates, workflow rules, visit types, dropdown values, SLAs and approved business rules where explicitly delegated.
- May be the same person as the System Administrator in a small organization, but permissions are separable.
- Configuration changes are versioned/audited and must not silently alter historical records.

## 3.9 Initial Department Configuration

Initial departments to configure are:

- **CRD — Clinical Research Department** (initial business focus).
- **QMS — Quality Management System**.
- **ITD — Information Technology Department**.
- **Management**.

Do not configure a GMP department/workflow as part of the initial release unless the product owner adds it through a future approved scope change. The architecture may support additional departments later. Department membership does not automatically grant report editing, approval, download, configuration or administrative permissions; those remain separate role/permission decisions. GCP responsibilities may be represented through CRD assignments and role permissions.

## 3.10 Permission model

Use granular permissions, not just Read/Write. At minimum support:

`View`, `Create`, `Edit`, `Comment`, `Respond`, `Review`, `Verify`, `Approve`, `Download`, `Export`, `Assign`, `TransferOwnership`, `Configure`, `Administer`, `AuditReview`, `Archive`, `ReopenRequest`, `ElectronicSign`.

Role templates are starting defaults. The server must check both role permissions and record scope/assignment. A user can have multiple roles, but segregation-of-duties rules still apply.

### 3.11 Permission summary

- **Associate Director GCP:** create projects; assign PMs; provide provisional initial monitor assignment; assign/reassign visit monitors; organization-wide tracking and status visibility; report download permission.
- **Project Manager:** assigned-project scope; prepare/approve MP; coordinate visit delegates; review and verify reports; manage comments and sponsor-share events; update tracker milestones; download draft, review, revised and final report versions within assigned project scope.
- **CRA/Monitor:** assigned work only; author reports; respond to PM/QMS comments; sees client code rather than sponsor/client identity in the CRA workspace; no full Project Tracking Repository and no report download.
- **QMS:** organization-wide tracking/review visibility; report comments and verification; quality/aging/deviation visibility; report download permission and audit-trail review.
- **Director:** broad management visibility as configured. Does not automatically receive the Director of Operations' final approval authority. Report downloads are not permitted by default; the three download-authorized role categories are PM, QMS and Associate Director GCP.
- **Director of Operations:** broad management visibility and final-approval responsibility. The default GCP report workflow requires Director of Operations final approval; approved workflow profiles may define a different approval chain only through explicit owner-approved, versioned change control. The Director of Operations is not a report-download-authorized role by default; report downloads remain limited to PM, QMS and Associate Director GCP.
- **System Administrator:** user/security/technical administration according to granted permissions. The administrator role alone does not permit editing report content, bypassing approvals or deleting audit history.
- **Business/Quality Configuration Administrator:** controlled configuration of templates/workflows/visit types/SLAs/permissions only where explicitly granted.

Report-download permission is limited to the Project Manager, QMS and Associate Director GCP. CRA/Monitor, Director, Director of Operations and system/business administrators do not receive report-download permission merely because of their title; a user must hold one of the explicitly authorized roles and have access to that report/project. This baseline cannot be widened by ordinary role configuration. Any change requires explicit product-owner approval and a controlled MA revision. All access checks are enforced by the backend independently of frontend visibility. Other permission overrides are supported only where they do not violate mandatory approval gates, project scope, record integrity or segregation-of-duties controls.

---

# 4. High-Level Technical Architecture

## 4.1 Technology stack

- **Frontend:** Next.js with TypeScript.
- **Backend:** NestJS with TypeScript.
- **Database:** PostgreSQL.
- **Development:** VS Code on the local computer initially.
- **Source control:** Git; remote hosting may be introduced as selected by the product owner.
- **AI integration:** provider-agnostic adapter; no provider is hard-coded until selected and assessed.
- **Document generation:** server-side Word/PDF generation from structured data/templates.

Do not introduce Cursor as a required dependency. Development can occur in VS Code with an approved coding agent.

## 4.2 Logical layers

1. Presentation layer (Next.js role-specific user experiences).
2. API/application layer (NestJS modules and guards).
3. Domain/workflow layer (state transitions, permission checks, version creation, SLA logic).
4. Persistence layer (PostgreSQL, migrations and constraints).
5. Document/AI processing layer (controlled file ingestion, extraction, source evidence, generated artifacts).
6. Audit/security/notification cross-cutting services.

## 4.3 Suggested backend modules

- Auth and Sessions
- Users, Roles, Departments and Permissions
- Organizations, Sponsors, Facilities/Sites and Project Contacts
- Projects and Ownership Assignments
- Project Tracking and Milestones
- Monitoring Plan Management
- Protocol Documents and AI Extraction
- Template/Form Engine
- Visit Planning and Visit Execution
- Monitoring Reports
- Comments and Review Tasks
- Workflow Engine
- Electronic Signatures/Approvals
- Document Artifacts and File Storage
- CAPA/follow-up readiness and deviation alerts/linkage
- Notifications
- SLA/Working Calendar/Aging
- Audit Trail and Audit Review
- Reports/Dashboards/Exports
- Archival/Retention
- Configuration and Change Control

## 4.4 Frontend workspaces

- Login/security screens.
- Role-specific Dashboard.
- Associate Director Project Creation and organization overview.
- PM Project Workspace and Project Tracking Sheet.
- Monitoring Plan Management workspace.
- CRA/Monitor My Work.
- Section-based Report Authoring.
- PM/QMS Review Mode.
- Director of Operations approval queue.
- Admin configuration area.
- Audit-trail review interface.
- Document/AI source review interface.

---

# 5. Project Creation, Assignment and Ownership Transfer

## 5.1 Project creation fields

The project creation page must support the following fields, with a schema that can be extended:

- Serial number (system-generated or controlled sequence).
- ZENOVEL in-house project ID.
- Sponsor/client project ID.
- Sponsor/client name.
- Client code (confidentiality visibility rules apply).
- Project/study title or short title.
- CRO name.
- Clinical facility/site.
- Bioanalytical facility, where applicable.
- Project receipt date.
- Tentative project start date.
- Project Manager selection.
- Optional provisional CRA/Monitor selection.
- Study/project category and other configurable fields.

Do not add contract fields or a project-contract workflow.

## 5.2 Sponsor/client identity visibility

PM, Associate Director GCP and other authorized management/QMS users may see sponsor/client identity according to their permissions. The CRA/Monitor workspace, API responses, project lists, notifications, file names and AI-source views must display the assigned client code instead of revealing the sponsor/client name. If an approved report template requires the sponsor name in the generated document, resolve it from the controlled project record only in the authorized document-generation/review path; do not expose it as an editable CRA field or return it in the CRA-facing API. Test this at the API level, not only in the UI.

## 5.3 Creation sequence

1. Associate Director GCP creates and submits the project.
2. The system validates required fields and checks duplicate identifiers.
3. The project is stored in PostgreSQL with a unique internal ID.
4. The selected PM receives an in-app notification and sees the assignment.
5. PM accepts or records an authorized decline/return reason.
6. The project enters Pre-Initiation and becomes available to the assigned PM.
7. A provisional monitor, if entered at project creation, does not replace the final MP visit delegation.

## 5.4 Ownership transfer when a PM leaves

An authorized Associate Director or authorized administrator can transfer a project to a new PM through a controlled ownership-transfer action.

The transfer must:

- Record previous PM, new PM, effective event timestamp, actor and reason.
- Grant the new PM the required access to that project and related operational records.
- Transfer open work queues, tasks and notifications as appropriate.
- Include MP, MP versions/amendments, protocol sources, visits, monitor delegation, reports, report versions, comments, CAPA-related records, project-tracker history, sponsor-sharing records and attachments.
- Notify the new PM and relevant users.
- Preserve historical records showing the former PM's period of responsibility.
- Revoke the former PM's project access unless another explicit role/assignment still permits access.
- Never rewrite historical approvals, signatures, comments or audit events.

---

# 6. Monitoring Plan Management

## 6.1 Purpose and naming

The application section is named **Monitoring Plan Management**. It is the controlled planning source for a project's monitoring risk, strategy, visit schedule, contacts, responsibilities and timelines.

## 6.2 Initial content structure based on ZENOVEL's MP template

The template engine must be able to represent at least these sections, matching the supplied template where practical:

1. MP cover/header and version history.
2. Project/study/protocol details.
3. Purpose/objective and introduction.
4. Reference/document requirements used to prepare the MP.
5. Protocol/study summary.
6. Risk assessment (system-level and study-level).
7. Risk mitigation strategy.
8. Monitoring strategy and scope.
9. Visit type and visit-specific monitoring focus.
10. Communication plan and escalation pathway.
11. Monitoring/report timelines.
12. Document sharing rules.
13. Archival/retention information.
14. Additional information/comments.
15. MP review/approval/signature section.
16. Version/amendment history.

The exact section structure is template-configurable. Preserve useful content from the supplied MP; do not silently delete business requirements during template conversion.

## 6.3 MP field types

Reuse the common form engine: plain text, rich text, date, numeric field, dropdown, single/multiple selection, checkbox, Yes/No/N/A, repeated table rows, attachments where authorized, conditional questions, required/optional/conditional-mandatory fields, and a universally available, optional section-level “Add Additional Information/Comment” area in every MP/report section, even when that section already contains predefined fields.

## 6.4 MP meeting and attendee management

PM can:

- Schedule an MP meeting with date/time, mode/location, agenda and meeting metadata.
- Invite QMS, CRA/Monitors, Directors, delegates and other authorized attendees.
- See invitations/acceptance/attendance states where implemented.
- Record attendance, discussion, decisions, action items, responsible person and due date.
- Record the person conducting the discussion.
- Generate the Monitoring Delegation Log from the same data instead of manually re-entering it.

Initially use in-app notifications; architect a future SMTP/email adapter.

## 6.5 Risk assessment

Represent risk assessment as structured entries, not only one free-text block. Each entry may include:

- System-level or study-level category.
- Risk indicator/description.
- Source/evidence.
- Risk code/score and scoring scheme version.
- Risk level (Low/Medium/High or the controlled scheme defined by ZENOVEL).
- Rationale.
- Mitigation action.
- Responsible role/person.
- Monitoring focus/visit linkage.
- Review/approval status.

Do not silently calculate a score using an invented formula. If the approved scoring methodology is not present in the supplied template/SOP, expose it as a controlled configuration requiring approval before automating the score-to-risk mapping.

AI may suggest risks and monitoring focus, but PM must review, edit or reject suggestions. AI does not make the final risk decision.

## 6.6 Visit Planning Matrix

The MP includes a visit matrix with:

- Visit type.
- Clinical/bioanalytical phase or other category.
- Method (on-site/remote/other approved method).
- Type/scope of monitoring.
- Planned timing/date/window.
- Planned duration/number of days.
- Site/facility.
- Primary monitor.
- Secondary/backup monitor.
- Blind monitor, if applicable.
- Additional delegate(s), if applicable.
- Applicable report template.
- Visit-specific risk focus, comments and instructions.

A project may have multiple visit types and multiple visit records. Visit types are configurable and initially include SIV, Period-01/02/03/04, IPBM, RTBM, SCV, ETC/custom types. The current controlled template mapping is selected automatically based on visit type unless an authorized configuration rule states otherwise.

## 6.7 Monitor roles and provisional assignment

Support at minimum Primary, Secondary/Backup, Blind and Additional Delegate roles. Role usage is configurable per project/visit.

A monitor nominated on project creation is provisional. **The approved MP/visit-delegation record is authoritative for operational visit allocation.** A later change in assignment must be recorded in history.

## 6.8 MP approval and execution

- PM prepares the MP.
- PM is the sole required in-application approver of the MP under the agreed baseline.
- The MP must not require QMS/Director approval unless the product owner later changes the requirement.
- PM approval is a controlled event with user identity, timestamp, meaning and approved MP version.
- The application generates the MP as Word and PDF.
- PM can sign the document outside the application and upload the executed/signed copy.
- The system-generated MP and signed/executed copy are stored as separate artifacts; upload never overwrites the generated original.
- Record signature/execution status, upload identity/time, file hash and relation to the relevant MP version.
- Support a configurable project-readiness gate. At minimum, PM approval and the required visit delegation must be complete before activation. If the applicable process requires signed-copy upload before activation, configure that condition explicitly rather than assuming it for every project.

## 6.9 MP versioning and amendments

- MP versions have controlled statuses such as Draft, PM Approved, Executed/Signed, Superseded and Retired/Cancelled where justified.
- A material change to an approved MP creates an amendment/new controlled version; it does not mutate the prior approved/executed version.
- Capture the change reason and section/field history.
- Retain previous MP versions and their associated source documents and approvals.
- Changes may be triggered by protocol amendments, risk changes, visit-plan changes, monitor reassignment, sponsor requirements or operational events.

---

# 7. AI-Assisted Monitoring Plan Preparation

## 7.1 User experience

Provide an **Upload Protocol / Reference Documents** area within Monitoring Plan Management. The PM can upload protocol PDF or Word files. Other document types (e.g., protocol amendment, synopsis, bioanalytical plan or supporting reference documents) may be enabled by controlled configuration.

Flow:

`Upload → document validation → store original → AI extraction → map to MP fields → show evidence/conflicts/missing fields → PM accept/edit/reject → populate approved fields → PM completes remaining sections → MP approval`.

## 7.2 Extraction scope

AI may suggest/extract:

- Protocol title, identifier, version and date.
- Sponsor protocol ID and CRO study code.
- Sponsor, CRO, clinical/bioanalytical facilities and contacts when present.
- Study design, treatment/period/sequence, sample size and study endpoints.
- Population and eligibility/inclusion/exclusion information.
- Dosing, restrictions, sample collection/handling, special tests and safety-related protocol requirements.
- Study-specific monitoring risks and potential monitoring focus.
- Protocol-related visit or milestone details where explicit.

AI must not invent values that are not supported by the source. Information absent from the protocol should be marked Not Found / PM Input Required.

## 7.3 Source evidence and acceptance

For every proposed populated value, retain where available:

- Source document ID, file name, document type and version.
- Page number and section/heading.
- Supporting excerpt/evidence.
- AI/model/provider version or identifier.
- Extraction timestamp.
- Confidence/status where supported by the extraction method.
- User decision (Accepted, Edited and Accepted, Rejected, Needs Clarification).
- User and timestamp of the decision.

UI should make it easy to view the source and compare it with the proposed field value.

## 7.4 Protocol amendment precedence

The **latest effective amendment is authoritative for the sections it amends**. Apply the amendment chain to the baseline protocol: use the latest effective wording for changed sections and retain unamended baseline content. Do not treat a short amendment document as if it replaces the entire original protocol. Retain all previous documents as historical sources.

If versions conflict, amendment status is unclear, or effective dates/version identifiers are inconsistent, do not silently choose. Flag a source conflict and require PM resolution.

## 7.5 AI risk assessment and visit suggestions

AI can suggest risk categories, mitigation ideas, visit scope or a visit matrix based on protocol evidence. Each is a proposal with source evidence. PM is accountable for accept/edit/reject decisions and the final MP.

## 7.6 AI limitations and governance

- AI must never approve the MP or sign any record.
- AI-generated text/values remain unapproved until accepted by an authorized PM.
- Retain sufficient versioning and processing metadata to reproduce/review how suggestions were made, where technically feasible.
- Use a provider/configuration whose data-use, retention and no-training terms are reviewed/approved before confidential documents are sent. Do not assume provider privacy terms; make the provider selection and data-processing configuration an approval gate.
- Restrict AI document access to the current project and user permissions.
- Audit uploads, extraction runs, errors, output acceptance/rejection and model/configuration changes.
- Apply file type/size validation, malware scanning and safe parsing before processing.
- If AI is unavailable, the PM must still be able to complete the MP manually.
- AI failure must not corrupt or partially overwrite accepted MP content.

---

# 8. Visit Management and Project Activation

## 8.1 Separate planned and actual visits

The MP creates **planned visits**. When monitoring activity is scheduled/initiated, an actual visit instance is created/activated and linked to the planned visit, MP version and project.

Each actual visit has:

- Project and planned-visit reference.
- Visit type and report template version.
- Site/facility.
- Assigned monitor(s) and responsibility role(s).
- Planned dates/duration and actual visit start/end dates.
- Status, notes and relevant operational milestones.
- Report and review state.

## 8.2 Visit status

Examples: Planned, Assigned, Pending Acceptance, Accepted, Scheduled, In Progress, Completed, Cancelled, On Hold. Implement only statuses needed by the approved workflow, while preserving configurability.

## 8.3 Visit acceptance and reassignment

The assigned monitor should acknowledge/accept the visit/assignment in the application. Reassignment must retain previous monitor, new monitor, actor, reason and event timestamp. When a Primary CRA is unavailable, an authorized PM/Associate Director can activate the designated backup, update the assignment and notify affected users. Historical assignments remain intact.

## 8.4 Project activation

The project remains Pre-Initiation until configured readiness requirements are satisfied. Baseline gate:

- PM assigned and has accepted the project.
- MP is complete and approved by the PM.
- Required visit-wise delegation is completed.
- Any configured required signed MP artifact is present.

Once the gate passes, the project can be activated. The system must record the transition and must not activate it silently.

---

# 9. Report Template and Authoring Engine

## 9.1 Templates

Initial scope includes nine existing monitoring-report templates. The exact templates are supplied by the product owner and mapped to visit types. The system must not invent the missing nine template contents; use the actual uploaded templates as the source for conversion.

## 9.2 Structured form engine

Represent templates as versioned schemas with sections, subsections, fields/questions, field types, conditional logic, validations, help text, display order and mapping to generated document output.

Support:

- Short text and long/rich text.
- Numeric/integer/decimal values.
- Dates and date/time where appropriate.
- Dropdowns.
- Single and multi-select.
- Yes/No/N/A.
- Checkboxes.
- Repeating tables/rows.
- Conditional display/requirements.
- Mandatory, optional and conditional mandatory fields.
- Additional comments/observations in relevant sections.
- Attachments when authorized and appropriate.
- Field/section guidance and template mapping.

## 9.3 Template lifecycle

Template statuses: Draft, Under Review, Approved, Effective, Superseded, Retired. Only an effective approved version can be used for new reports. Existing reports remain bound to their original template version. New versions must not silently alter historical reports.

## 9.4 CRA report authoring workspace

The UI must not be a long, dull form or a single Word-like canvas. Provide:

- Left navigation with headings/sections/subsections.
- Central section content editor.
- Optional right panel for comments/help/source context.
- Previous/Next and section jump.
- Expand/collapse sections.
- Search within the report.
- Indicators for Complete, In Progress, Not Started, Mandatory Field Missing and Comment Requires Response.
- Overall progress (e.g., sections completed / total sections).
- Jump to next unresolved comment.
- Jump to missing required field.
- Restore current working position after navigation/return.
- Autosave and clearly visible saved/saving/error states.
- A controlled Save Draft option where useful.
- An optional “Add Additional Information/Comment” control in every report section, regardless of whether predefined fields already exist. This is CRA-authored narrative content, separate from formal reviewer comment threads.

## 9.5 Autosave behavior

Autosave must preserve input without creating a formal report version on each save. Handle network interruption gracefully, show an unsaved/error state where needed, retry safely, and avoid duplicate writes or lost edits. Server-side conflict handling is needed if a record is edited in more than one session. Do not claim autosave succeeded until the backend acknowledges persistence.

---

# 10. Report Workflow, Comments and Approval

## 10.1 Standard workflow

`CRA Draft → Initial Draft Submitted to PM → PM Review → CRA Correction → PM Verification → QMS Review → (if required) CRA/QMS correction loop → QMS Verification/Completion → Director of Operations Final Approval → Final Controlled Report`.

PM, QMS and Associate Director GCP can download authorized report versions at any lifecycle stage within their project/role scope. Non-final copies must be clearly labelled Draft/Review/Unapproved. CRA/Monitor, Director, Director of Operations and administrators who do not also hold an explicitly download-authorized PM/QMS/Associate Director role cannot download reports from the application. Enforce this through backend authorization, not only hidden buttons.

After final approval, PM shares the report with sponsor outside the application and records the sharing event. Sponsor sharing is not inferred merely from final approval.

## 10.2 PM review

PM reviews the report, adds section/field-specific comments, returns the report for correction, and verifies each response. When satisfied, PM sends the report to QMS. PM verification is not equivalent to final Director approval.

## 10.3 QMS review

QMS can comment, return for correction, and complete review/verification. The review state must be clear. A QMS review cannot be skipped by ordinary users. A configurable workflow may define whether comments return to CRA directly or pass through the PM, but the baseline operating model is PM-coordinated correction with CRA performing the work.

## 10.4 Director of Operations approval

For the **standard GCP report workflow**, Director of Operations approval is mandatory before a monitoring report receives the status **Final Approved**. It must be a controlled approval/signature event linked to the exact final report version. The active, approved workflow profile defines the required approval gates. No user can bypass any gate required by that profile. An approved profile may add or omit configurable approval/signature steps; changing the standard GCP baseline or removing a baseline-required gate requires explicit product-owner approval, versioned configuration, testing and MA/configuration change control. No silent override is allowed.

## 10.5 Configurable final signature and approval block

For the standard GCP report output, include the following signature/approval entries, linked to the exact final report version:

- Prepared by — CRA/Monitor.
- Reviewed by — Project Manager.
- Reviewed by — QMS.
- Final Approved by — Director of Operations.

The signature block must be generated against the exact final report version being approved, not a working draft or superseded version. For the standard GCP report workflow, PM review/verification, QMS review/verification and Director of Operations final approval are the baseline required gates. The approval/signatory configuration must support increasing or reducing the number of configured approval/signature steps for an approved report/workflow profile, including adding an optional sponsor signature when required. Each profile must explicitly define its required and optional approvers/signatories and their order. Removing or bypassing any currently mandatory baseline gate requires an explicit product-owner-approved workflow change under MA/configuration change control; it must never happen through an ordinary template edit or unnoticed configuration change.

The initial release does not require direct sponsor login. Where a sponsor signature is required, support an appropriately labelled signature block in the generated document and/or upload of the externally signed final artifact, with signer identity, role, date, artifact/version linkage and audit history recorded. Future integrated sponsor signing may be added after separate approval. Any change after final signature creates a new controlled version and requires the applicable reviews/signatures again.

## 10.6 Comment lifecycle

Comments should be anchored to a section/question/field wherever possible and retain:

- Comment ID and linked project/visit/report/template version.
- Section/field reference.
- Author and role.
- Server timestamp.
- Comment text and priority/type if configured.
- CRA response, response author and response timestamp.
- Reviewer follow-up/resolution, resolver and timestamp.
- Status (Open, Response Submitted, Under Review, Resolved, Reopened).
- Reopening reason/history.

Comments cannot be silently deleted. If a comment was created in error, use a controlled void/withdraw action that retains the original event and reason.

## 10.7 Review Mode

PM/QMS Review Mode must present comment navigation and a clear context of the field/response, original comment, CRA response and current status. Provide “next unresolved comment” navigation. Do not require reviewers to scan an entire report manually to find open items.

## 10.8 Sponsor feedback

Sponsor comments are initially recorded by an authorized ZENOVEL user and linked to the relevant report/version/section. Sponsor feedback enters the controlled revision/review process. Do not require sponsor login for the first release.

---

# 11. Versioning, Change History and Record Integrity

## 11.1 Three distinct concepts

1. **Autosave snapshot:** technical persistence of working content; not a formal version.
2. **Formal report version:** a controlled milestone such as first submission, resubmission after corrections, sponsor-driven revision or controlled amendment.
3. **Change history:** field/section-level record of changes with values and context.

## 11.2 Initial version numbering

The initial submission to PM is represented as **Initial Draft**. After the first requested correction/resubmission, the first formal revision may be labeled **Version 1**, followed by Version 2, Version 3 and so on. The exact displayed labels should be consistent across the UI and generated files. Do not produce a new formal version for each autosave.

Each formal version captures the submitted report content and relevant template version as an immutable snapshot. The current working draft may continue independently until the next submission snapshot.

## 11.3 Change history requirements

Capture as appropriate:

- Project/visit/report ID.
- Section/field changed.
- Previous value and new value (with safe handling of sensitive data).
- User/role.
- Server timestamp.
- Reason/change reference where required.
- Comment linkage where relevant.
- Workflow state at the time.
- Source/AI extraction reference if the change relates to accepted AI content.

Change history should be available in a backend review/export view when needed; do not clutter every report section with technical log details. The final report may include a concise version/change summary if configured.

## 11.4 Final record immutability and correction

No ordinary report hard-delete. Final approved reports are immutable. If a finalized report needs correction, use controlled reopen/amendment:

`Request Reopen/Amendment → Justification → Authorized decision → New version → Required review/approval → New final version`.

The previous final remains available as historical/superseded; its signature and audit history are preserved.

## 11.5 Hashes and integrity

For generated/final artifacts, calculate and retain a cryptographic hash, such as SHA-256, plus file metadata. The hash supports integrity verification but is not itself a digital signature or proof of regulatory compliance.

---

# 12. Project Tracking Sheet

## 12.1 Access and purpose

The full Project Tracking Repository is intended for PMs, Associate Director GCP, QMS and Directors/authorized management. CRA/Monitor users do not get the full tracker by default. The default list order is ascending by Sr. No. (or the agreed stable project/visit sequence), while users may change sorting and filters. Keep the default ordering deterministic.

The PM view should mirror the existing Zeel workbook process as closely as practical. PostgreSQL is the source of truth; the screen is a live application view, and exports are generated from current records.

## 12.2 Core columns

Preserve the original Zeel tracker's relevant fields where applicable, including:

- Sr. No.
- Sponsor.
- ZENOVEL / In-house Project ID.
- Project ID.
- Short Study/Project Title.
- Project Status.
- Project Detail.
- CRO Name and clinical/bioanalytical facility/site.
- Regulatory Submission status/details.
- Type of Visit.
- Agenda Shared.
- Monitor/Auditor.
- Visit End Date.
- Report from Monitor/Auditor / First Draft Report Submission Date.
- Report to Sponsor / Report Shared to Sponsor Date.
- Sponsor Approval.
- Signed Report Shared to Sponsor / Signed Report Date.
- MFR to CRO / follow-up communication field where used in the existing tracker.
- CAPA from CRO / CAPA Received Date.
- Study Result.
- Source Documents in Central Drive / source-document filing status (the application's repository is authoritative for application-managed documents).
- QMS Archival Submission.
- Comments.
- Final Archival Date.

Additional columns discussed by the product owner (e.g., serial number, in-house ID, client/sponsor, CRO/site, visit type, monitor, first draft date, sponsor-share date, signed date and CAPA received date) must remain available. The tracker may show multiple visit rows under one project; do not flatten multiple visits into a single unstructured project row.

## 12.3 Track project and report status separately

Project status and visit/report status are separate concepts.

Example project statuses: Pre-Initiation, Active/Ongoing, On Hold, Completed, Archived, Cancelled (where permitted).

Example report statuses: Not Started, Draft, Initial Draft Submitted, PM Review, CRA Correction, PM Verification, QMS Review, QMS Correction, QMS Verified, Awaiting Director Approval, Final Approved, Sponsor Shared, CAPA Pending, Closed/Archived.

Avoid a single overloaded status field that mixes project, visit, report and CAPA lifecycle.

## 12.4 Click-to-update tracker dates

Where the PM updates a tracker milestone through a button/action, the backend must record the current server date/time. The PM must not type an earlier date or backdate that milestone. Example: “Mark Report Shared to Sponsor” stamps the current server event time.

- Do not allow ordinary users to alter the recorded milestone timestamp after the event.
- If an action was recorded incorrectly, preserve the original event and create a controlled correction event with current timestamp, actor and reason; do not rewrite history.
- Planned dates are separate planning fields.
- Actual visit/event dates may be captured as business data when needed, with the actual date and server record-entry timestamp distinguished where retrospective recording is permitted. This must not be used to backdate a click-generated tracker milestone.

## 12.5 Sponsor-sharing deadline, overdue flag and deviation notification

The default deadline is to **share the draft monitoring report with the sponsor within five working days after completion of the monitoring visit**, unless an authorized PM-configured sponsor/project/visit-specific timeline overrides the default. Saturdays and Sundays are not counted. The configurable working calendar may additionally identify applicable non-working holidays. The default is five working days; some sponsors/projects may require seven, ten or another approved number of working days. The PM must be able to update the applicable timeline for the sponsor/project/visit. Each change must be audited with actor, timestamp, previous value, new value and a reason. A timeline change must not erase an overdue event or its history that was already recorded.

The monitor's initial draft submission date to the PM is captured in the tracker when the submission event occurs, but no SLA/overdue clock is required for the monitor-to-PM submission under the current baseline. The five-working-day default applies to the **Report Shared to Sponsor** milestone, not to the date the monitor first submits to the PM. Keep these dates and clocks separate.

If the report has not been shared by the applicable sponsor-sharing deadline, highlight the tracker record red, display **Sponsor Report Overdue**, set **Deviation Required**, and notify the assigned PM, QMS and Associate Director GCP. This is a separate-process flag: the system alert does not itself create or close the formal deviation record. The formal deviation-management process remains separate.

Separately, whenever a deviation is identified/recorded/reported in a monitoring report (for example, through a configured deviation question/flag or an authorized reviewer action), mark the related report/project with **Deviation Reported** and notify:

- The assigned Project Manager.
- QMS.
- Associate Director GCP.

The notification must identify the project/visit/report and the fact that a deviation was reported, while respecting role-level confidentiality. Retain the trigger/source, actor, timestamp and notification status in the audit trail. Do not confuse an overdue sponsor-sharing milestone with an actual deviation reported in the report.

## 12.6 Filters and exports

Filters include Sponsor, Project ID, ZENOVEL ID, Study Title, CRO/Site, Visit Type, Monitor, PM, Project Status, Visit Status, Report Status, CAPA Status and Date Range.

Provide Excel (.xlsx) and CSV exports, plus PDF/print view where appropriate. Export respects role/scope and active filters. A dedicated Sponsor Share View/Export must show only authorized external fields; it must exclude internal comments, internal escalation, QMS-only information, internal users' notes and other non-approved data.

---

# 13. Dashboards and Notifications

## 13.1 Common visual structure

For management/PM dashboards, the upper area displays key statistics and concise charts; the lower area displays the project/visit/report list with useful filters and drill-down.

## 13.2 Suggested metrics

- Total assigned projects.
- Pre-Initiation projects.
- Ongoing/Active projects.
- Completed projects.
- Archived projects.
- Visits planned/ongoing/completed.
- Reports in draft, PM review, CRA correction, QMS review, waiting for Director approval and final.
- Pending comments/actions.
- Overdue milestones and deviation flags.
- PM-wise and CRA-wise project/workload distribution.

Counts must be computed from persisted records and be consistent with filtered lists. Do not hard-code statistics.

## 13.3 Role-specific views

- **CRA My Work:** new assignments, assigned visits, reports in progress, comments requiring response, corrections required and completed work.
- **PM:** assigned projects, visit/report statuses, review queue, comments, overdue work, tracking milestones and sponsor-share actions.
- **QMS:** organization-wide view, review queue, quality/aging signals and audit-trail review.
- **Associate Director:** project portfolio, PM/CRA distribution, project creation/assignment status and organizational performance.
- **Director/Director of Operations:** broad management view; Director of Operations additionally receives final approval tasks.
- **Admin:** system/configuration and security functions, separate from ordinary business workspaces.

## 13.4 In-app notifications

Support recipient, type, related project/visit/report, message, created timestamp, read/unread state and action link. Initial events include assignment, acceptance, project activation, monitor delegation/reassignment, comments, correction requests, review completion, director approval required, overdue milestone and deviation alert. New assignments and high-priority deviation alerts should provide a visible pop-up/toast when the user is active as well as a persistent notification-centre entry.

Email/SMTP is future scope. Design the notification service so an email channel can be added later without changing each business module.

---

# 14. Authentication, Security and Authorization

## 14.1 Identity

- Unique named account for each individual; shared accounts prohibited for normal use.
- User activation/deactivation and role/department assignment are controlled and audited.
- Deactivation must revoke active sessions/tokens and block future access promptly.

## 14.2 Password policy

- Require a unique password per user account.
- Minimum composition baseline: letters and numerals; symbols may be permitted. Use an adequate minimum length and block common, compromised and context-specific passwords.
- ZENOVEL policy: **password expiry/change every 30 days**, configurable in security settings but set to 30 days initially.
- Require a password change on first login/reset when configured.
- Prevent immediate reuse using password history policy.
- Secure password reset with expiring, single-use tokens.
- Never store plaintext passwords. Use a modern password-hashing method such as Argon2id with suitable parameters and per-user salt.
- Force change if compromise is suspected even when the 30-day period has not elapsed.

The 30-day period is an explicit ZENOVEL organizational policy, not a claim that Part 11 or Annex 11 universally mandates 30-day changes. Security policy should be documented and periodically reviewed.

## 14.3 Session and login protection

- Rate limit repeated failures; protect against brute force and credential stuffing.
- Define lockout/throttling and secure recovery behavior.
- Session expiry/inactivity timeout.
- Secure logout and token/session invalidation after password change, account deactivation or relevant role change.
- MFA capability and stronger authentication for privileged roles and critical actions.
- Re-authentication for configured electronic-signature/critical approval events.
- Do not use security questions as the sole password-recovery control.
- Log relevant login, failed-login, lockout, password change/reset, MFA and administrator events without logging secrets.

## 14.4 Authorization

- Server-side authorization for every protected API, object, download and export.
- Enforce role permission plus project/report assignment scope.
- Test for insecure direct object reference (IDOR), cross-project access and attachment path guessing.
- CRA report download prohibition must be enforced by the backend even if a direct API request is attempted.
- A user with one role must not inherit unrelated privileges simply because they have a second role.
- Segregation-of-duties constraints override ordinary permission grants for mandatory approval steps.

## 14.5 Security engineering

- Parameterized database operations/ORM-safe queries.
- Input validation, output encoding, XSS/CSRF/SQL injection protections.
- Secure headers and content security policy appropriate to the application.
- Rate limiting and request size limits.
- Secret manager/environment variables; no credentials or tokens committed to Git.
- File upload controls: extension/MIME validation, size limits, malware scanning, safe document parsing and safe download headers.
- Encryption in transit and at rest, including backups.
- Dependency vulnerability scanning, patch process, SBOM/dependency inventory and periodic security review.
- Protected security logs and alerting for relevant high-risk events.
- Use OWASP ASVS as a verification baseline; version at drafting: ASVS 5.0.0, with the selected requirements version recorded in project security documentation.

---

# 15. Audit Trail, Electronic Signatures and Regulated Records

## 15.1 Audit trail events

Capture relevant events including:

- Authentication/security events.
- Project creation and field changes.
- Project/PM/CRA assignments and transfers.
- MP creation, edits, approvals, versions and amendments.
- Protocol document upload, version designation and AI processing/acceptance.
- Visit creation, scheduling, assignment and completion.
- Report creation, field modifications, submissions, resubmissions and version events.
- Comments and responses.
- PM/QMS review and verification.
- Director approval and electronic signatures.
- Downloads and exports.
- Sponsor-sharing event.
- Deviation flag/notification.
- CAPA/closure/archive events.
- Template/workflow/role/permission/configuration changes.
- Archive, restore and controlled reopen events.

Each audit event should have a stable event ID, actor/service identity, server timestamp, event type, target record, relevant context, outcome and correlation/reference IDs. Previous/new values should be captured for meaningful record edits with care to avoid leaking secrets or excessive sensitive data.

## 15.2 Audit protection and review

- Ordinary users cannot edit or delete audit records.
- Privileged technical access to the database must be restricted, monitored and covered by procedures.
- Use append-oriented, tamper-evident design and protected backup/retention controls. Do not claim absolute immutability unless the implementation and infrastructure demonstrably provide it.
- QMS/authorized roles need a searchable Audit Trail Review interface with date/user/project/report/section/event filters and export/review evidence as configured.
- Use server-controlled timestamps, stored in UTC and displayed in the configured business timezone.
- Synchronize server time through the deployment environment's trusted time service.

## 15.3 Electronic signatures and approvals

Electronic-signature/approval events must capture unique identity, date/time, action meaning, record/version signed and required authentication/re-authentication. Examples of meaning include Prepared, Reviewed, Verified, Approved.

- CRA preparation acknowledgment/signature can be recorded as configured.
- PM review/verification is separate from PM final approval of the MP.
- QMS review is separate from Director of Operations final approval.
- The standard GCP report profile requires Director of Operations final approval; another approval profile may alter the configured chain only with explicit product-owner approval, versioned configuration and appropriate testing.
- Upload of a physically/electronically signed MP is a distinct artifact from in-app PM approval.
- Pasted images/typed names alone must not be represented as a controlled electronic signature event.

## 15.4 No hard deletion

No normal business role can hard-delete a project/report/MP/comment/version/audit record. Where a record must be withdrawn, voided, superseded or archived, use a controlled status change/reason and retain the original history. Data disposition after retention expiry requires a documented policy and authorized process.

---

# 16. Document Generation, Uploads and Storage

## 16.1 Generated documents

Generate Word/PDF from structured records and the corresponding template version. Preserve approved layout, section ordering, tables, headings and configured page elements.

Documents should include applicable metadata:

- ZENOVEL/project ID.
- Visit ID and type.
- Sponsor/study identifiers per permissions/template.
- Report/MP ID and version.
- Template name/version.
- Generated timestamp.
- Page numbering.
- Prepared/reviewed/approved details and dates.
- Draft/controlled/final status label.
- Signature/approval information.

Non-final downloads must be clearly marked as Draft/Review/Unapproved where appropriate. The final approved PDF is the preferred controlled presentation artifact. Word remains editable after download and must not be represented as tamper-proof.

## 16.2 Uploads

Keep original uploaded files, including protocol versions, signed MP copies and authorized supporting documents. Store metadata including uploader, timestamp, file name/type, size, version, linked project/MP/report, hash, validation/scanning status and retention classification.

## 16.3 Storage boundary

Per the product owner's requirement, PostgreSQL is the sole authoritative persistence store for application data and file content. Use an appropriate PostgreSQL binary storage strategy (e.g., BYTEA or another justified PostgreSQL-native approach) for uploaded and generated documents, with streaming access as appropriate. Do not use the local filesystem or cloud object storage as the only authoritative copy unless the product owner explicitly approves a future architecture change.

This decision means database backup, restore, growth, performance and recovery testing must include binary document content.

## 16.4 File security and hash

Validate uploads, scan for malware, store hash and metadata, and ensure unauthorized users cannot retrieve artifacts through guessed identifiers or direct URLs. Verify integrity as appropriate before generating/share/export operations.

---

# 17. Sponsor Sharing, CAPA, Deviation Flags and Archival

## 17.1 Sponsor-share event

After a report is finalized, PM shares it with the sponsor outside the application. Record:

- Report ID and exact version shared.
- User who marked/shared it.
- Server date/time.
- Recipient/sponsor contact and method where captured.
- Optional communication proof/attachment.
- Relevant comments.

Final Approved does not automatically mean Sponsor Shared. Those are distinct statuses/events.

## 17.2 Sponsor-safe exports

Provide a controlled external view/package for tracker exports. Internal tracker exports can contain internal comments, QMS findings, internal escalations and assignment details that must not automatically be disclosed to a sponsor. External fields must be explicitly allowlisted and reviewed.

## 17.3 Deviation indication and overdue flag separation

Maintain separate flags for:

1. **Sponsor Report Overdue:** the draft monitoring report was not shared with the sponsor by the applicable deadline. Default is five working days after visit completion, excluding Saturday/Sunday, with PM-configurable sponsor/project/visit-specific timelines.
2. **Deviation Reported:** an actual deviation is identified/recorded/reported in a monitoring report.
3. **Deviation Required:** a formal deviation record is required. Missing the applicable sponsor-sharing deadline sets this flag under the baseline rule.

When an actual deviation is reported in a monitoring report, set **Deviation Reported** and notify the assigned PM, QMS and Associate Director GCP. When the applicable sponsor-sharing deadline is missed, set **Sponsor Report Overdue** and **Deviation Required**, highlight the tracker red, and notify the same roles. These flags remain distinct: a system alert is not itself the formal deviation record or evidence of closure. Maintain links/references to the separate deviation process where available, and preserve trigger evidence and notification history.

## 17.4 CAPA-ready design

Track CAPA where applicable, initially including receipt date and existing tracker fields. The model should support a fuller lifecycle later:

`CAPA Required → Requested → Received → Under Review → Accepted/Returned → Closed`.

Support reference, responsible party, due date, receipt/review/closure dates, comments, attachment and change history where enabled.

## 17.5 Archival and retention

Archive projects, MP/report versions, comments, approvals/signatures, audit trail, protocol sources, generated artifacts, sponsor-share records and CAPA references. Retention is configurable by applicable law, study type, sponsor agreement and approved policy; do not hard-code 25 years as a universal rule. Archived records remain searchable to authorized roles but read-only except for controlled disposition/correction workflows.

---

# 18. SLA, Working Calendar and Aging

## 18.1 Working calendar

Implement a configurable calendar with organizational timezone, working days, weekends and holidays. Store event timestamps in UTC; calculate user-facing deadlines under the configured business calendar.

## 18.2 SLA and sponsor-sharing deadline configuration

Make SLA/timeline rules configurable by sponsor, project, visit type, report type and workflow step where applicable. The **default sponsor-sharing deadline is five working days after the visit end date**. Saturday and Sunday are excluded; applicable holidays can be configured in the working calendar. The PM can set/adjust the sponsor-sharing timeline for the applicable sponsor/project/visit (for example, seven or ten working days) without changing the global default. Changes require an audit event and reason, and must not retrospectively erase an already-triggered overdue event.

Other durations may be configured later for PM review, CRA correction, PM verification, QMS review/correction, Director approval and CAPA milestones. **No SLA is required for the monitor's initial draft submission to the PM in the current baseline.** The date itself is retained as a tracking event. The five-working-day red alert applies to the sponsor-sharing milestone, not the monitor-to-PM draft handoff.

## 18.3 Aging states and alerts

Support On Time, Due Soon/At Risk and Overdue states. Overdue sponsor-sharing items are prominent and red in the tracker. The system should show the configured deadline, elapsed/remaining working days and the milestone that triggered the flag. The default sponsor-sharing deadline is five working days from the visit end date; Saturdays and Sundays are not counted. The PM may set a different sponsor/project/visit-specific duration (e.g., seven or ten working days), with a recorded reason, previous/new values, actor and timestamp. Timeline changes do not erase an overdue event already raised. The monitor-to-PM initial draft submission has no SLA in this baseline. All status calculations must be explainable and testable.


---

# 19. Project Contact and Protocol/Study Profile Data

Store reusable project-level data rather than retyping it into every MP/report:

- Project/study profile (title, identifiers, study design, phase/type, key controlled fields).
- Sponsor and sponsor representative.
- CRO and clinical/bioanalytical facility/site entities.
- Investigator/site contact, where applicable.
- PM and monitoring team contacts.
- Sponsor representative contact.
- Contact role, organization, effective period and project relationship.

An MP/report may use snapshot values as needed to preserve what was included at generation/approval time. Updates to a contact directory must not silently rewrite historical generated documents.

---

# 20. Proposed Data Model (Logical Entities)

The following is the logical domain model. The final physical schema may refine naming and normalization during Stage 0/1 design, but must preserve these relationships and traceability.

| Entity | Purpose / key relationships |
|---|---|
| User | Unique identity, status and authentication metadata |
| Role / Permission / UserRole | Configurable roles and granular permissions |
| Department | Organizational department membership |
| Session / SecurityEvent | Session lifecycle and security signals |
| Organization | Sponsor, CRO, site/facility, vendor or partner organization |
| Contact | Person/contact record with organization and role relationships |
| Project | Core project record and current lifecycle/status |
| ProjectOwnershipHistory | PM assignment/transfer history |
| ProjectAssignment | User responsibility/assignment within project |
| ProjectContact | Project-specific contact role/effective period |
| ProtocolDocument | Uploaded protocol/amendment/source artifact and version metadata |
| ProtocolSourceVersion | Version/effective status and amendment-chain relationship |
| AIExtractionRun | Model/provider/config version, status, timestamps and results reference |
| AIFieldSuggestion | Suggested field value, source evidence, confidence/status and user decision |
| MonitoringPlan | MP identity linked to project |
| MonitoringPlanVersion | Versioned MP content, statuses, approval and artifact relationships |
| MPMeeting | Meeting date/time, agenda, mode, attendees and decisions |
| MeetingAttendee / ActionItem | Invitation/attendance and action tracking |
| RiskAssessmentItem | Risk category, score, rationale, mitigation and visit linkage |
| PlannedVisit | MP-planned visit strategy/delegation/template mapping |
| Visit | Actual operational visit instance/status/dates |
| VisitAssignment | Primary/Secondary/Backup/Blind/additional role and assignment history |
| Template | Logical report/MP template identity |
| TemplateVersion | Controlled template schema/version/lifecycle |
| TemplateSection / TemplateField | Section hierarchy, fields and conditions |
| TemplateChoice / ConditionalRule | Dropdown values, branching and validation logic |
| Report | Logical report identity linked to project/visit |
| ReportWorkingDraft | Current editable content and autosave state |
| ReportVersion | Immutable submitted/revision snapshot and version status |
| FieldResponse | Structured report data associated with fields/template version |
| Comment / CommentResponse | Review thread, response, status and resolution history |
| WorkflowInstance / WorkflowEvent | Per-record state and allowed transition/event history |
| Approval / ElectronicSignatureEvent | Approval/signature meaning, identity, time and record version |
| DocumentArtifact | Uploaded/generated Word/PDF/signed copy stored in PostgreSQL with metadata/hash |
| TrackerMilestone | Project/visit milestones with event timestamps and source event |
| DeviationFlag / DeviationReference | Overdue/trigger flag and relation to separate deviation process |
| CAPARecord / CAPAEvent | CAPA lifecycle-ready data and event history |
| SponsorShareEvent | Specific report version shared, actor, timestamp and recipient/method |
| Notification / NotificationDelivery | In-app notices; future email-delivery records |
| SLAConfiguration / WorkingCalendar | Timing rules, working days and holidays |
| AuditEvent | Protected event history across modules |
| ConfigurationVersion | Controlled change history for business configuration |
| ArchiveRecord / RetentionPolicy | Archival status, policy and disposition controls |

Use primary keys, foreign keys, uniqueness constraints, indexes and transactions to preserve integrity. Prefer relational structure for core entities; JSONB may be used for versioned form schemas/responses where justified, but critical query/relationship fields and workflow constraints must remain explicit and validated. The schema must support template-version pinning and immutable version snapshots.

---

# 21. Workflow Engine and State Controls

## 21.1 Configurable state machine

Do not hard-code a chain of screen-specific conditions throughout the codebase. Use a workflow/state-transition service that defines:

- Record type and workflow type.
- Current state.
- Allowed next states.
- Actor role/permission/scope required.
- Preconditions and required fields.
- Required comments/reasons.
- Version creation rules.
- Lock/edit behavior.
- Required notification events.
- Audit events.
- Deadline/SLA effects.
- Whether the transition is reversible and under what controlled process.

## 21.2 Report state example

`Draft → Initial Draft Submitted → PM Review → CRA Correction → PM Verification → QMS Review → QMS Correction (if needed) → QMS Verified → Awaiting Director Approval → Final Approved → Sponsor Shared → Closed/Archived`.

Loops are allowed only through controlled transitions. No gate required by the active approved profile can be bypassed. The standard GCP report profile requires Director of Operations final approval.

## 21.3 MP state example

`Draft → PM Review/Completion → PM Approved → Signed/Executed Copy Uploaded (when required) → Active/Effective → Amended/Superseded`.

The precise MP state names may be configured, but PM is the only required in-app approver under this baseline.

## 21.4 Workflow safety

- Validate state transitions on the server.
- Reject out-of-order actions and unauthorized direct API attempts.
- Use database transactions for state change + version snapshot + audit event + relevant notification creation where possible.
- Prevent duplicate submissions/approvals caused by retries.
- Ensure failed transitions do not leave partially-updated records.
- Provide clear user-visible error reasons without exposing internal secrets.

---

# 22. UI/UX and ZENOVEL Design System

## 22.1 Brand and visual style

The application must look neat, clean, attractive, premium and professional—not like a raw CRUD system or dull spreadsheet clone. Use the current Zenovel website, approved logo and actual brand assets as the design source. Do not invent arbitrary brand hex values; identify and document the actual palette before implementation.

Use:

- Clear typography and hierarchy.
- Consistent spacing, alignment, grid and responsive behavior.
- Restrained brand-color accents and clean neutral surfaces.
- Polished forms, tables, charts, navigation, dialogs, empty/loading/error/success states.
- Consistent iconography and semantic status colors.
- Accessible contrast, keyboard navigation and visible focus states.
- Role-specific workspaces with consistent components.

## 22.2 Usability by role

- CRA: My Work, assigned visit, long report with high-level section navigation and comment jumps.
- PM: operational dashboard, live Project Tracking Sheet, MP Management and review queue.
- QMS: portfolio, review queue, quality/deviation/aging indicators and audit-trail review.
- Associate Director: project creation, assignments and organizational overview.
- Director of Operations: broad view and final approval queue.
- Admin: controlled setup and configuration.

## 22.3 Project Tracking UI

Preserve the familiar Excel workflow where practical: recognizable column names, sortable/filterable table, clear status indicators, inline/one-click milestone actions, drill-down and export. Improve legibility but do not force PMs to relearn the operating process unnecessarily.

## 22.4 Report editor UI

Use a three-area pattern where suitable: left section navigation, central content and optional right contextual panel for comments/help/source evidence. Avoid overwhelming the CRA with administrative complexity. Make unresolved comments, mandatory fields and save state obvious.

## 22.5 UX acceptance requirements

- A user can identify their next action without reading a manual.
- The CRA can open any section without completing earlier sections first, subject to required submission checks.
- Save status is visible and truthful.
- Filters and dashboard counts match the underlying authorized data.
- No action appears available if the user lacks permission; backend checks must independently enforce this.
- Tables/forms should be usable on common desktop screen sizes and adapt to tablets as practical.
- Accessibility should be considered throughout development.

---

# 23. Non-Functional Requirements

## 23.1 Reliability and consistency

- Use transactions for important multi-record operations.
- Use constraints and integrity checks in PostgreSQL.
- Avoid silent data loss, duplicate event creation or partial version snapshots.
- Provide recoverable errors and safe retry behavior.

## 23.2 Performance

- Paginate and filter large tables on the server.
- Index commonly queried identifiers, assignments, states, dates and foreign keys.
- Stream document content from PostgreSQL where practical rather than loading unnecessarily large binary payloads into memory.
- Establish measurable performance targets during Stage 0/1 based on local hardware and expected initial user volume; do not invent performance claims.

## 23.3 Maintainability

- Modular code and clear frontend/backend responsibilities.
- TypeScript types and shared API contracts where appropriate.
- Database migrations for schema changes.
- Environment-based configuration and safe secrets handling.
- Automated tests and CI-friendly commands.
- Logging that helps diagnose issues without exposing confidential report contents unnecessarily.
- Document architecture and non-obvious business rules.

## 23.4 Recovery

- PostgreSQL backup/restore including file binaries.
- Document restore tests.
- Recovery and disaster-recovery procedures documented and periodically tested before production regulated use.
- Define recovery objectives during deployment planning instead of inventing unsupported targets.

---

# 24. Testing and Validation Strategy

Testing is required throughout development. A clean build is not sufficient evidence by itself.

## 24.1 Test levels

- Unit tests for business rules, workflow transitions, validators, SLA calculations and permissions.
- Integration tests for NestJS modules and PostgreSQL transactions/migrations.
- API tests for successful and unauthorized operations.
- UI tests for key workflows and role-specific navigation.
- End-to-end tests for full project-to-report lifecycle.
- Security tests for IDOR, access scope, file access, download prohibition, injection, session controls and role privilege changes.
- Document tests for Word/PDF structure, pagination, metadata, version labelling, signatures/approval display and artifact hashes.
- AI tests for extraction accuracy, source evidence, amendment precedence, conflicts, unsupported values and failure behavior.
- Backup/restore and archival retrieval tests.
- Regression tests for any fixed defect.

## 24.2 Acceptance evidence per stage

For every stage, retain:

- Requirements covered.
- Changed files/modules.
- Database migrations.
- Commands/tests run and actual results.
- Manual testing steps and results.
- Bugs/known limitations.
- Security implications.
- Product-owner acceptance state.

## 24.3 Regulatory/validation traceability

Support the mapping:

`Requirement → risk/control → design/module → configuration → test case → test result/evidence → review/approval`.

Validation approach (e.g., risk-based qualification/verification and IQ/OQ/PQ where applicable) is determined in the system lifecycle and intended-use assessment. Do not claim validation completion before the evidence is executed and approved.

---

# 25. Staged Development Plan and Approval Gates

**The coding agent must implement only the stage expressly authorized. It must stop after reporting results and wait for user acceptance before the next stage.**

## Stage 0 — Master Architecture (this document)

- Owner reviews the architecture and confirms it as baseline.
- Resolve any remaining policy questions before their corresponding stage.
- Freeze initial requirements, role matrix, lifecycle and test/acceptance process.

**Gate:** product-owner approval of the baseline.

## Stage 1 — Technical Foundation and Design System

- Inspect existing repository and environment before changes.
- Establish Next.js frontend, NestJS backend and PostgreSQL connection/configuration.
- Establish repository structure, TypeScript standards, lint/format/test scripts, environment variable handling, database migrations and health checks.
- Establish initial design-system tokens/components based on the actual ZENOVEL brand assets.
- Establish safe logging, error handling and baseline security configuration.
- No premature implementation of future business modules beyond scaffold/dependencies needed for foundation tests.

**Gate:** application starts locally, database migrations work, health checks pass, design-system preview reviewed, no secrets committed, tests pass.

## Stage 2 — Authentication and Permissions

- Implement identity, login, password policy/30-day expiry, secure reset, sessions, user lifecycle, role/department/permission management.
- Implement backend authorization and project-scope foundations.
- Test allowed and denied operations, session expiry, deactivation and role change.

**Gate:** permission test matrix passes, especially denial of unauthorized API/object access.

## Stage 3 — Projects and Project Tracking

- Project creation and PM assignment/acceptance.
- Project lists, management dashboards, filtering, tracker columns, controlled date actions and exports.
- Project/visit/report status separation and PM ownership-transfer workflow foundations.
- Five-working-day sponsor-sharing overdue/deviation flag (weekends excluded), configurable PM timeline overrides and notifications when prerequisite visit/report data exist. Monitor-to-PM draft receipt is tracked without an SLA.

**Gate:** tracker reconciles against test data; PM cannot see another PM's assigned-only records; click-generated milestone dates cannot be backdated; sponsor-sharing deadline defaults to five working days excluding weekends and can be overridden with an audited PM-configured timeline; missed deadline is red and notifies PM/QMS/Associate Director; export respects permissions.

## Stage 4 — Monitoring Plan Management

- Convert actual MP template into versioned structured schema.
- MP meeting, attendees, action items, risk assessment, Visit Planning Matrix, delegation log, PM approval, Word/PDF and signed-copy upload.
- MP amendments, source records, activation gate.

**Gate:** sample project MP can be completed, approved, generated and signed copy uploaded without loss of history.

## Stage 5 — AI-Assisted MP Preparation

- Upload/validate protocol PDF/Word into PostgreSQL.
- Extract/map field suggestions with source evidence.
- Implement PM acceptance/edit/rejection, missing data, conflicts and amendment precedence.
- Validate AI-provider data terms before enabling actual confidential document processing.

**Gate:** a test protocol is processed and suggestions are traceable; unsupported values are not silently populated; conflicting amendment values are flagged; manual MP preparation still works.

## Stage 6 — Visits and Report Authoring

- Planned/actual visits, assignments and template mapping.
- Convert the nine real report templates when provided/approved.
- Section navigation, conditional questions, additional comments, autosave and completion states.

**Gate:** CRA can author a long report in any section order, autosave/reopen safely, and cannot download a report through the API.

## Stage 7 — Review, Versioning and Approval

- PM review/comments, CRA responses, PM verification, QMS review and approval gates defined by the active workflow profile; the standard GCP profile requires Director of Operations final approval.
- Formal versions, change history, record locking, authorized reopen/amendment and electronic approval events.

**Gate:** complete review loops work; history is retained; no final status is granted until all gates required by the active approved profile are complete. The standard GCP profile requires Director of Operations approval.

## Stage 8 — Documents and Sponsor Sharing

- Word/PDF output; signed/executed artifact storage; hashes; download logging; sponsor-share event; sponsor-safe tracker export.

**Gate:** generated files and final-version signature blocks are inspected; only PM/QMS/Associate Director can download reports at permitted lifecycle stages; the exact shared report version is recorded; signatory/approval counts can be increased or reduced by approved workflow profile. The standard GCP profile requires Director of Operations approval.

## Stage 9 — Quality and Operational Controls

- Working calendar and SLA/aging dashboard.
- Deviation alerting, CAPA-ready controls, audit-trail review, notification refinements and archival controls.

**Gate:** overdue calculations, recipient notifications, audit review and retention/archival tests pass.

## Stage 10 — System Verification and Deployment Readiness

- End-to-end/regression/security/performance/recovery testing.
- Requirements-to-test traceability and validation documentation.
- Production configuration/hardening guidance and operational procedures.

**Gate:** documented tests and open defects reviewed; deployment is not called production-ready until product owner and appropriate quality/regulatory stakeholders accept the evidence.

---

# 26. Mandatory Coding-Agent Operating Instructions

The AI coding agent must follow these rules whenever it is used to develop the system:

1. Read this MA before implementation and follow it as the authoritative requirement baseline.
2. Build one approved stage at a time. Do not implement future stages without authorization.
3. First inspect the repository, installed tools, current code and existing tests. Never assume the repository is empty.
4. Before significant changes, summarize the proposed approach and affected files/data models.
5. Preserve existing working code. Avoid broad rewrites when a focused change is sufficient.
6. Never delete, truncate or recreate the database to make a test pass without explicit approval and a verified backup/test environment.
7. Use database migrations; do not modify schema only in an undocumented manual step.
8. Never hard-code credentials, tokens, private keys or confidential protocol/report contents in source code or logs.
9. Never rely on frontend-only authorization. Enforce every protected action in NestJS/backend and validate record scope.
10. Do not invent missing template content or alter supplied template meaning. Flag source/template ambiguity.
11. Do not silently change workflows, approval gates, versioning, the report-download role allowlist, tracker dates, the five-working-day sponsor-sharing default, configurable sponsor-specific timelines, deviation alerts or AI amendment precedence.
12. Do not treat autosave as a formal version. Do not hard-delete controlled records.
13. Do not let AI approve records, suppress source conflicts or populate unsupported values as accepted facts.
14. Keep PostgreSQL as the authoritative store for all application data and files unless the owner explicitly approves a change.
15. Produce useful automated tests and run them. Report actual output and failures, not optimistic statements.
16. After each stage, provide: summary, changed files, database changes, commands run, test evidence, manual test instructions, defects/limitations and questions needing an owner decision.
17. Stop after a stage and wait for the product owner to test/accept it. Never continue automatically into the next stage.
18. When proposing an improvement outside the agreed scope, explain value, trade-offs and affected requirements, then request approval before implementation.
19. Do not claim 21 CFR Part 11/EU Annex 11 compliance, completed validation, penetration-test success or deployment readiness without appropriate evidence and review.
20. Prefer readable, maintainable, strongly typed, modular code over rushed generation.

---

# 27. Owner Decisions Already Locked

| Decision | Baseline rule |
|---|---|
| Company/project scope | ZENOVEL Pharma Services only |
| Project contracts | Excluded |
| Frontend/backend/database | Next.js / NestJS / PostgreSQL |
| Authoritative storage | PostgreSQL, including document file content under current requirement |
| Initial development | Local environment in VS Code |
| Password change | ZENOVEL policy: every 30 days, configurable |
| Project creator | Associate Director GCP |
| First-level project owner | Project Manager |
| Project monitor at creation | Optional and provisional |
| MP section name | Monitoring Plan Management |
| MP approver | Respective PM only |
| Authoritative visit monitor assignment | Approved MP/visit delegation |
| Report author | Assigned CRA/Monitor |
| Report review | PM → CRA corrections → PM verification → QMS review → Director of Operations final approval |
| Director final approval | Mandatory in the standard GCP report profile; alternate required approval chains need explicit product-owner approval, versioned configuration and testing |
| CRA report download | Prohibited |
| PM/QMS/Associate Director download | Permitted within assigned role scope and authorized project scope |
| Director of Operations download | Not permitted by default; only PM, QMS and Associate Director GCP are authorized report-download roles |
| Autosave | Required; no formal version per autosave |
| Formal version/change history | Separate from autosave; retain prior snapshots/history |
| Deletion | No ordinary hard-delete of controlled records |
| AI source | Latest effective amendment overrides changed content; unchanged baseline content is retained; conflicts are flagged |
| MP execution | Generate Word/PDF; signed copy can be uploaded separately |
| Project tracking | Core module for PM, Associate Director, QMS and Directors/authorized management |
| Tracker click-date rule | Current server timestamp; no backdating for click-generated milestones |
| Sponsor-share deadline | Default 5 working days after visit end, excluding Saturday/Sunday; PM can set sponsor/project/visit-specific timeline (e.g., 7 or 10 working days) with audit history |
| Monitor-to-PM draft handoff | Capture submission date; no SLA/overdue clock in the current baseline |
| Overdue/deviation flag | Missed configured sponsor deadline: red Sponsor Report Overdue + Deviation Required, notify PM/QMS/Associate Director; actual Deviation Reported is separate and also notifies those roles; formal deviation remains separate |
| Report download roles | Only PM, QMS and Associate Director GCP; backend-enforced for draft and final versions |
| Initial departments | CRD, QMS, ITD and Management; GMP-specific workflow excluded from initial scope |
| Report signature block | Applied to exact final version; approved workflow profiles can increase/reduce approval/signature steps and add sponsor signatory; standard GCP PM/QMS/mandatory Director Ops gates remain unless changed by explicit owner-approved MA/configuration change control |
| Report section additional information | Optional additional-information/comment control in every section |
| Deviation process | Separate; flag/link and notify PM, QMS and Associate Director |
| Sponsor sharing | PM shares externally and records the exact version/event in the application |
| Sponsor tracker export | Dedicated approved external view; never unrestricted internal tracker export |
| Notifications | In-app now; SMTP/email capability later |
| UI | Polished, clean, premium ZENOVEL-branded enterprise interface |
| Development practice | Stage-wise implementation, test, owner review and explicit acceptance before next stage |

# 28. Decisions That Must Be Configurable Rather Than Hard-Coded

- Visit types and template mappings.
- Template sections, fields, dropdown values, conditional logic and mandatory fields.
- Workflow states/transitions where allowed by approved business rules.
- Role/permission assignments and project scope.
- Whether a signed MP copy is required before activation for a particular project type.
- Risk score calculation and mapping, once ZENOVEL's approved methodology is supplied.
- SLAs by sponsor/project/visit/report/workflow step. Sponsor-sharing defaults to five working days after the visit ends; PM may set a project/sponsor/visit-specific timeline (e.g., seven or ten working days) with reason and audit history. Monitor-to-PM draft submission has no SLA in the current baseline.
- Working calendar, holidays, weekends and timezone.
- Notification recipients and event mappings.
- Retention requirements and archive/disposition rules.
- Sponsor-safe export fields.
- Allowed report downloads by role.

Configuration changes must be authorized, versioned and traceable. Changes to existing records must follow the effective configuration/version rules.

---

# 29. Regulatory and Security Reference Framework

The following are design/reference sources. The project team must review applicability to the system's intended use and the relevant predicate rules; maintain current controlled copies/links during validation.

1. **FDA, Part 11 — Electronic Records; Electronic Signatures: Scope and Application**: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/part-11-electronic-records-electronic-signatures-scope-and-application
2. **FDA, Electronic Systems, Electronic Records, and Electronic Signatures in Clinical Investigations: Questions and Answers (October 2024)**: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/electronic-systems-electronic-records-and-electronic-signatures-clinical-investigations-questions
3. **European Commission, EudraLex Volume 4 / Annex 11 listing**: https://health.ec.europa.eu/medicinal-products/eudralex/eudralex-volume-4_en
4. **European Commission, Annex 11 Computerised Systems, published January 2011**: https://health.ec.europa.eu/document/download/8d305550-dd22-4dad-8463-2ddb4a1345f1_en
5. **European Commission, proposed revised Annex 11 consultation materials (draft status; check current status before use)**: https://health.ec.europa.eu/consultations/stakeholders-consultation-eudralex-volume-4-good-manufacturing-practice-guidelines-chapter-4-annex_en
6. **OWASP Application Security Verification Standard (ASVS)**: https://owasp.org/projects/asvs
7. **NIST Digital Identity Guidelines FAQ**: https://pages.nist.gov/800-63-FAQ/

Regulatory references change. At design/validation and before regulated production use, verify current official versions and record the applicable version in the controlled validation/compliance documentation. The 30-day password-expiry interval is a ZENOVEL policy choice, not stated here as a universal statutory requirement.

---

# 30. Final Acceptance Philosophy

The system is considered ready to progress only when the approved stage meets its acceptance criteria and the product owner is able to test the result. For the overall application, success means:

- Users see only their authorized data and actions.
- PMs retain a familiar and useful Project Tracking Sheet.
- MP information is prepared, reviewed, approved and amended in a controlled manner.
- AI extraction is evidence-based, reviewable and never authoritative without human acceptance.
- Planned visits and visit-specific reports are linked correctly.
- CRA can author a long report efficiently, autosave safely and navigate comments directly.
- Gates required by the active approved workflow profile cannot be bypassed; the standard GCP report profile requires PM/QMS review and Director of Operations final approval.
- Every formal version, change, approval, download, sponsor-share action and ownership transfer is traceable.
- Controlled files and the associated metadata are preserved in PostgreSQL as required.
- Sponsor-sharing overdue flags, Deviation Required and actual Deviation Reported are distinct, auditable states; a missed configured sponsor deadline sets Sponsor Report Overdue + Deviation Required (red) and notifies PM/QMS/Associate Director; actual report deviations notify the same roles.
- Backups, restore, security, validation and operational procedures are demonstrated, not merely described.
- The interface looks and behaves like a polished ZENOVEL enterprise application.

**End of Master Architecture & Build Specification — Version 1.1**
