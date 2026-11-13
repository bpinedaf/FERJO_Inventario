# FERJO Inventory & Commercial Operations Platform

Operational web platform for inventory, quotations and commercial workflows, designed for a real small-business environment.

The system combines a browser-based frontend with **Google Apps Script** backend services and cloud deployment to support day-to-day operations with traceability, role-based access and production-oriented workflows.

## Main capabilities

- Inventory management
- Product and commercial data workflows
- Quotation generation and history
- PDF quotation generation
- Role-aware authentication and operational access
- Cloud-based frontend/backend integration
- Production deployment and rollback procedures
- Technical validation and documented release testing

## Architecture

- **Frontend:** HTML, CSS and JavaScript
- **Backend / automation:** Google Apps Script
- **Hosting / deployment:** Netlify
- **Data and workflow integration:** Google Workspace / cloud services

## Engineering approach

This project is not only a user interface. It includes production deployment documentation, verification procedures, regression testing, rollback planning and operational traceability.

The quotation module, for example, was validated in both TEST and production environments before release, including PDF generation, multi-page rendering, calculations, access controls and historical records.

## Repository highlights

- `admin.js` — administrative and operational logic
- `auth.js` — authentication workflow
- `apps-script/` — backend / Apps Script components
- `cotizaciones.js` — quotation workflow
- `cotizaciones-panel.html` — quotation user interface
- `COTIZACIONES_TEST_RESULTADOS.md` — validation evidence
- `COTIZACIONES_DESPLIEGUE.md` — deployment documentation

## Context

The platform demonstrates my current focus on **automation, systems integration, operational reliability and digital transformation**: translating real business requirements into maintainable production workflows.
