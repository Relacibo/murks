# 2200 · Rezept-Entwurf: Draft → Bestätigung → Anlegen

**Prio: MITTEL**

## Was
Agent macht erst einen Entwurf (strukturiertes JSON), Nutzer bestätigt/ändert,
dann erst werden Stränge angelegt. Kein vorzeitiges `add_strang`.

## Konzept
```json
{
  "gericht": "Pfannkuchen",
  "zutaten": [{"item": "Mehl", "amount": 250, "unit": "g"}],
  "strangs": [{"name": "Teig", "steps": [{"title": "...", "description": "..."}]}]
}
```
- Tool `draft_recipe(json)` → setzt `cook.draft`
- Tool `confirm_recipe()` → legt Stränge + Zutaten an
- UI: Draft-View (Übersicht) solange unbestätigt

## Tasks
- [ ] `draft_recipe` Tool
- [ ] `confirm_recipe` Tool
- [ ] `cook.draft` State
- [ ] Draft-View-Komponente
- [ ] Prompt-Anpassung: erst Plan, auf Bestätigung warten

## Abhängigkeit
→ 0100 (Step-Datenmodell)
