# Reusable Security Controls Guide for SaaS Apps Handling Marketplace and Buyer Data

_As of 2026-10-09. Written to be copied into any project; replace items in [brackets]. Companion: [AWS_PENTEST_AND_AMAZON_SPAPI_REGISTRATION.md](./AWS_PENTEST_AND_AMAZON_SPAPI_REGISTRATION.md)._

## Purpose and how to use this guide

This guide lists the security controls an app must have, run and prove when it handles marketplace data and buyer personal information (PII) through Amazon's Selling Partner API.

**What Amazon expects** (from its developer documents; check the live pages, because versions differ):

- Meet Amazon's Data Protection Policy and pass a data security assessment; restricted roles also need an assessment by an Amazon-authorized third party ([security overview](https://developer-docs.amazon.com/sp-api/docs/security-compliance-overview)).
- Delete PII within 30 days of delivery; keep security logs 12 months and review them every two weeks; scan for vulnerabilities every 30 days; penetration test every 365 days; rotate keys yearly; report incidents within 24 hours ([key security controls](https://developer-docs.amazon.com/sp-api/lang-US/docs/guidance-to-address-key-security-controls-in-sp-api-integration), [vulnerability management](https://developer-docs.amazon.com/sp-api/docs/vulnerability-management)).

The rule that matters most: **answer Yes only to a control that runs today and that you can show evidence for.**

## Control checklist

Numbers come from Amazon's documents and security questionnaire; the "how" and "evidence" columns are practical suggestions.

| Area | Requirement | How to implement | Evidence to keep |
| --- | --- | --- | --- |
| Network | Firewall, IDS/IPS, anti-malware, segmentation | Private network, security groups, WAF, threat detection, malware scanning; database never public | Architecture diagram, service settings screenshots |
| Access | Least privilege by job duty; individual accounts | Role-based permissions; separate PII permission; no shared logins | Role list, user list, access-review notes |
| Access removal | Remove leavers' access within 24 hours | Off-boarding checklist | Dated checklists |
| Passwords and MFA | 12+ characters with special characters, MFA, expiry/rotation | Enforce in the app and identity provider | Policy, settings screenshot |
| Encryption in transit | All traffic over TLS | HTTPS only, redirect HTTP, TLS 1.2+ | Scan result, certificate |
| Encryption at rest | AES-128/RSA-2048 or better, with key management | Disk and database encryption, field-level encryption for PII, managed keys, yearly rotation | Key policy, rotation record |
| Retention | PII deleted within 30 days after delivery | Scheduled purge job | Job log, test record |
| Logging | Keep 12 months; review every two weeks | Central logs, alerts, calendar review | Review notes |
| Vulnerabilities | Scans every 30 days; pen test every 365 days; critical fixed in 7 days, high in 30 | Managed scanner plus outside tester | Reports, ticket history |
| Code | Scan code before each release | Dependency and code scanning in the build | Pipeline results |
| Change management | Test, review and approve before production | Pull requests, required checks, staging | Approved pull requests |
| Backups | Encrypted, separate location, restore tested | Managed backup with copy to another region; quarterly restore test | Restore-test record |
| Incident response | Plan with roles, reviewed every 6 months, report to Amazon within 24 hours | See incident plan below | Plan, drill notes |
| Secrets | None in code, repositories or shared messages | Secrets manager, CI secrets, secret scanning | Settings, scan results |
| Test data | No real PII in tests | Synthetic data, simulated marketplace | Test plan |
| Devices | No PII on personal devices or USB | Policy, disk encryption, device management, USB blocking | Policy, device list |
| Third parties | List everyone who receives Amazon data | Data-flow table kept current | The table |

## Policies to write

Keep each to one or two pages: purpose, rules, who owns it, review date. Review all of them at least once a year.

| Policy | Must say |
| --- | --- |
| Information security | Who is responsible; scope; consequences of breaking it |
| Data classification and handling | What counts as PII and Amazon data; where it may live; who may see it |
| Privacy (public page) | What is collected, why, how long it is kept, how to ask for deletion, who receives it |
| Retention and disposal | PII deleted within 30 days after delivery; how deletion is done and checked |
| Access control | Least privilege, approvals, quarterly review, removal within 24 hours of leaving |
| Passwords and MFA | 12+ characters, MFA for every system holding Amazon data, rotation rules |
| Encryption and key management | What is encrypted, with what, who holds keys, yearly rotation |
| Logging and monitoring | What is logged (never PII itself), 12-month retention, bi-weekly review, alert contacts |
| Incident response | Roles, steps, 24-hour Amazon notice (see below) |
| Vulnerability management | Monthly scans, yearly pen test, fix times (7 days critical, 30 days high) |
| Change management | Review, test, approve, roll back; who may deploy |
| Backup and recovery | What, how often, where, recovery time and point targets, restore tests |
| Acceptable use and devices | No PII on personal devices or USB; disk encryption; lost-device steps |
| Third parties | Approval before sharing data; what each must protect |
| Training | Security briefing at joining and yearly; record who attended |

## Technical controls

**Encryption**

- TLS on every connection (users, API, database, third-party calls). Redirect HTTP to HTTPS.
- Encrypt the database and backups at rest with managed keys.
- Encrypt PII fields (name, address, phone, email) in the application with envelope encryption: a data key per record or tenant, protected by a managed master key; rotate the master key yearly.

**Access**

- Every request is scoped to the seller's own account (tenant id on every query); test this explicitly.
- A separate permission to view buyer details, so staff with orders access do not automatically see PII.
- Log every view or download of buyer data (who, what, when) without writing the data itself to the log.
- Passwords: 12+ characters, hashed with bcrypt or stronger, MFA required for admins and staff.

**Secrets**

- No secrets in code, chat or repositories; keep them in a secrets manager; turn on secret scanning in the repository; rotate at least yearly and after any exposure.

**Retention job**

- A scheduled job runs daily: for orders delivered more than 30 days ago (or cancelled/returned for the same period), clear buyer name, phone, email and full address; keep only what tax law needs. Log how many records it cleared. Test it with fake data.
- Do not keep raw copies of Amazon responses beyond the same 30 days.

**Logging**

- Central logs with 12-month retention, alerts for failed logins, permission changes and unusual data exports; never log PII.

**Backups**

- Encrypted, copied to another region, restore tested every quarter; apply the same 30-day deletion rule to backups (let old backups expire).

**Devices**

- Staff laptops: disk encryption, screen lock, device management. No buyer data downloaded to personal phones or USB drives; block removable storage where possible and alert when it is used.

## Operating routines

A control that is not on the calendar does not exist. Put these in a shared calendar and keep a one-line note each time.

| When | Task | Evidence |
| --- | --- | --- |
| Daily | Retention job runs; backup completes; alerts triaged | Job log, backup report |
| Every 2 weeks | Review security logs and alerts | Dated review note |
| Monthly | Vulnerability scan report reviewed; open findings ticketed | Scan report, tickets |
| Quarterly | Access review (who has what); restore test; remove unused accounts | Review sheet, restore record |
| Every 6 months | Review and update the incident response plan | Updated plan with date |
| Yearly | Penetration test and re-test; key and secret rotation; policy review; staff training; third-party assessment | Reports, rotation log, attendance |
| On leaving | Remove all access within 24 hours | Off-boarding checklist |
| On any incident | Follow the plan; tell Amazon within 24 hours | Incident record |

## Incident response plan (template)

**Roles:** Incident Manager [name, phone, email] (leads and decides), Technical Lead [name] (investigates and fixes), Communications Lead [name] (tells Amazon, sellers, authorities). Name a deputy for each.

**Steps**

1. **Detect and report:** anyone who sees a suspected breach, data leak, unauthorized access or lost device tells the Incident Manager at once. Record the time first noticed.
2. **Triage:** is Amazon data (any buyer information) involved? Severity: High if buyer data may be exposed, Medium if systems are affected without data, Low otherwise.
3. **Contain:** disable affected accounts and keys, block the attacker, isolate the system, switch off the leaking feature. Do not delete evidence; snapshot first.
4. **Investigate:** what was accessed, how, since when, which sellers; use the logs.
5. **Notify:** if Amazon information is involved, email **security@amazon.com within 24 hours of detection**, and notify affected sellers and any authority the law requires.
6. **Recover:** rotate secrets, patch, restore from clean backups, monitor closely.
7. **Learn:** within 7 days write what happened, why, and what changes; update controls.

**Database hack or unauthorized access:** cut access, rotate database and application secrets, check what was read or exported, restore if data was altered. **Data leak:** find and close the exposure, ask hosts or search engines to remove copies, notify.

**Notification email to Amazon (template)**

> Subject: Security incident involving Amazon Information — [company], app [app name/ID]
> Detected on [date/time]. Summary: [what happened]. Amazon Information affected: [types and approximate number of records, or unknown]. Actions taken: [containment]. Next update: [time]. Contact: [name, phone, email].

**Keep it alive:** review every 6 months; run a short tabletop exercise (talk through a made-up breach) once a year; keep the contact list current.

## Secure development

- **Environments:** development, staging (no real buyer data), production; production changes only through the pipeline.
- **Change management:** every change is a pull request with at least one reviewer other than the author; required checks (tests, scans) must pass; only named people can approve production releases; keep a rollback step.
- **Scanning in the build:** dependency audit (`npm audit` or equivalent), code scanning (for example CodeQL or Semgrep), secret scanning, container image scanning. Scan before every release.
- **Dependencies:** automated update pull requests; review monthly.
- **Fix times for findings:**

| Severity | Fix within |
| --- | --- |
| Critical | 7 days (Amazon rule) |
| High | 30 days (Amazon rule) |
| Medium | 90 days (suggested) |
| Low | Next planned release (suggested) |

- **Tracking:** each finding is a ticket with severity, owner, due date and the fix link; review open ones at the monthly meeting.
- **Runtime issues:** alert on errors, on unusual traffic and on failed logins; treat a suspected exploit as an incident.

## Evidence to keep

Keep these in one access-controlled folder, dated, for at least the period of the assessment cycle:

- Architecture and data-flow diagrams, and the list of third parties that receive Amazon data.
- The policies above, with approval dates.
- Screenshots or exports of settings: encryption, MFA, firewall rules, backup configuration, log retention.
- Scan reports, penetration-test report and re-test, the finding tickets.
- Access-review sheets, off-boarding checklists, training attendance.
- Backup restore-test records, retention job logs, key rotation log.
- Incident plan, drill notes, and any incident records.
- Change records: approved pull requests and release notes.

## Questionnaire answer guide

1. Read the question literally: "all of the following" means one missing item makes it No.
2. Answer Yes only if the control runs today **and** you can show evidence.
3. If an answer is No, say it, finish the control, then apply again. A false Yes can cost the role or the app.
4. For text answers, state what exists, with numbers, and nothing that is only planned. Ask hosting providers for written confirmation of anything they control.

**Wording to adapt (each under 500 characters)**

| Topic | Starting wording |
| --- | --- |
| Network protection | "The database sits in a private subnet with no public address. Security groups allow only the application to reach it. A web application firewall and managed threat detection protect the public endpoint. Developer machines use [endpoint protection] and disk encryption." |
| Employee access | "Each person has an individual account with MFA. Access is by role and need to know, approved by [owner], reviewed quarterly and removed within 24 hours of leaving. Buyer data needs a separate permission." |
| Personal devices | "Policy forbids storing Amazon data on personal devices or removable media. Company laptops use disk encryption and [device management], which blocks USB storage and alerts [owner]." (only if true) |
| Encryption at rest | "Database and backups are encrypted with AES-256 using [managed keys]. Buyer fields are additionally encrypted in the application with envelope encryption. Keys rotate yearly." |
| Backups | "Daily encrypted backups, kept [35] days, copied to a second region. Restore is tested quarterly. Recovery target: [RTO] hours, [RPO] hours." |
| Logging | "Application, access and cloud audit logs go to central storage, kept 12 months, reviewed every two weeks, with alerts for failed logins and unusual exports. Logs never contain buyer data." |
| Incident steps | "Detect, triage, contain (disable access, rotate keys), investigate with logs, notify security@amazon.com within 24 hours, recover, and write up lessons within 7 days. Plan reviewed every 6 months." |
| Passwords | "12+ characters with complexity, MFA on every system holding Amazon data, rotation per policy, enforced by [system]." (only if true) |
| PII in testing | "Tests use synthetic data and a simulated Amazon service. Real buyer data is never copied to staging or development." |
| Credentials | "Secrets live in a secrets manager and CI secrets, never in code or repositories. Secret scanning is on. Keys rotate yearly and after any exposure." |
| Tracking remediation | "Each finding is a ticket with severity, owner and due date; critical in 7 days, high in 30; reviewed monthly; fixes verified by re-scan or re-test." |
| Code vulnerabilities | "Dependency, code and secret scans run on every pull request and release; findings block release when critical or high; patched through reviewed pull requests." |

## Adapting this to another project

- [ ] List what buyer or personal data the project holds and where it is stored
- [ ] Draw the data-flow diagram and list every third party that receives data
- [ ] Choose hosting that lets you control network, encryption, logging and backups
- [ ] Write the policies above (one or two pages each) and name an owner
- [ ] Turn on MFA, individual accounts and role-based access; add a separate permission for buyer data
- [ ] Encrypt data in transit and at rest; add field-level encryption for PII
- [ ] Build the 30-day deletion job and test it
- [ ] Set up central logs with 12-month retention and a bi-weekly review reminder
- [ ] Set up scans (monthly), a pen test (yearly) and the finding tracker
- [ ] Add dependency, code and secret scanning to the build; require pull-request review
- [ ] Create staging with no real buyer data
- [ ] Write the incident plan with the 24-hour Amazon notice; run a tabletop drill
- [ ] Put the yearly and quarterly tasks on a shared calendar
- [ ] Collect the evidence folder before any assessment
