# Personas (procedural)

There are no fixed seed teammate JSON files. Unique agents are built from merged pools in `trait_pools.json`.

Default output is an LLM system-style prompt (not a JSON description). For structured data use `--format json`.

```bash
python3 generate_persona.py --count 3
python3 generate_persona.py --role frontend --seed 7 --out prompts.txt
python3 generate_persona.py --count 5 --format json --out team.json
python3 generate_persona.py --format both --out bundle.txt
```

See `manifest.json` and `../docs/personality.md`.
