# simple-software-factory


## Para disponer de una base de datos local
``` sh
docker run \
  --name agent-factory-postgres \
  -e POSTGRES_USER=agent \
  -e POSTGRES_PASSWORD=agentdev \
  -e POSTGRES_DB=agent_factory \
  -p 5433:5432 \
  -d postgres:17
```

## Para ejecutar los test con postgre
Configurar la variable de entorno PG_TEST_URL a nivel de bash.
```sh
export PG_TEST_URL="postgres://agent:agentdev@localhost:5433/agent_factory"
```