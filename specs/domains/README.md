# Domain specifications

Create one folder per bounded business domain and copy `specs/templates/domain-spec.md` to `<domain>/spec.md`.

Keep executable contracts beside the domain spec when the contract is owned by that domain:

```text
domains/
└── auth/
    ├── spec.md
    ├── openapi.yaml
    └── events/
        └── session-created.schema.json
```

Do not create a domain merely to mirror a technical layer such as controllers, database, or utilities. Domains represent stable business capabilities and ownership boundaries.
