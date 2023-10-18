# Dynamic CMS Connector Example

1. `yarn install && yarn run cms` to start the fake CMS
2. in a second terminal run `yarn run dev` to start the connector in development mode

CMS OpenAPI/Swagger docs are available via http://localhost:4848/documentation/static/index.html#/

The mock CMS internals aren't important, see `packages/connector/src/index.ts` for the
custom connector code!

## Defining dynamic data models

In order to dynamically create models from a remote data source,
you will need to:

1. Fetch the remote schema data

````js
	// our example CMS has a swagger endpoint
	const swaggerSchema = await SwaggerParser.dereference(
		`http://localhost:4848/documentation_transformed/json`,
	)

	// and also exposes a list of entity routes (these will become node models in
	// Connect)
	const routes = (await (
		await fetch(`http://localhost:4848/entity-map`)
	).json())
	```

2. Iterate on the returned data
```js
	for (const entityName of entityRoutes.keys()) {
		// ...
	}
````

3. Translate the remote schema into node model/object/union definitions

```js
for (const entityName of entityRoutes.keys()) {
	const properties = getSwaggerProperties(entityName)
	const fields = toModelFields(properties)

	// define.nodeModel is an SDK API.
	define.nodeModel({
		name: entityName,
		fields,
	})
}
```

```js
export function toModelFields(swaggerProperties) {
	const fields = {}

	for (const [swaggerFieldName, swaggerProperty] of Object.entries(
		swaggerProperties,
	)) {
		// id field is handled by the SDK automatically so don't create a field for it
		if (swaggerFieldName === `id`) continue

		// define relationship fields
		if (swaggerProperty.type === `object` || swaggerProperty.type === `array`) {
			fields[swaggerFieldName] = {
				// helper fn to find/create the field type name from a swagger property
				// object
				type: getModelTypeName(swaggerProperty),
				list: swaggerProperty.type === `array`,
			}

			continue
		}

		// scalar values like strings, numbers, etc
		fields[swaggerFieldName] = {
			type: swaggerProperty.type,
		}
	}

	// return the fields object to be used in Connect
	return fields
}
```

## Fetching data

There are 2 main data fetching scenarios:

- Full data fetch
- Changed data fetch

### Initial full data fetch

1. Use the `createAllNodes` SDK API

```js
connector.event("createAllNodes", async ({ models }) => {
	console.log(`\nFetching all CMS data`)
	// ...
	console.log(`finished fetching all CMS data\n`)
})
```

2. Using some data from your CMS, determine which routes to fetch for each model that
   was defined in previous steps.

```js
connector.event("createAllNodes", async ({ models }) => {
	console.log(`\nFetching all CMS data`)

	const { entityRoutes } = await getCMSInfo()

	for (const [name, model] of Object.entries(models)) {
		// ...
	}

	console.log(`finished fetching all CMS data\n`)
})
```

3. Fetch data from your data source and insert it into the Connect DB using
   `models.ModelName.create()`

```js
connector.event("createAllNodes", async ({ models }) => {
	console.log(`\nFetching all CMS data`)

	const { entityRoutes } = await getCMSInfo()

	for (const [name, model] of Object.entries(models)) {
		const entityUrl = entityRoutes.get(name).list
		const entities = await fetchJson(entityUrl)

		// you can pass a single node model object, or an array of objects here
		model.create(entities)
		/**
		ex:
		models.Presenter.create([
			{
				"id": "user-1",
				"name": "Edd"
			},
			{
				"id": "user-2",
				"name": "Tyler"
			}
		])
		*/
	}

	console.log(`finished fetching all CMS data\n`)
})
```

### Subsequent changed data updates

Whenever data is updated in your data source, your Connector can react to it and
update the Connect DB accordingly:

1. Implement the `updateNodes` SDK API:

```js
connector.event("updateNodes", async ({ models }) => {
	console.log(`\nfetching CMS updates`)
	// ...
	console.log(`finished fetching CMS updates\n`)
})
```

2. Fetch a list of recent changes from your data source:

```js
connector.event("updateNodes", async ({ models }) => {
	console.log(`\nfetching CMS updates`)
	const changes = await fetchJson(`${apiUrl}/changed-entities`)
	console.log(`finished fetching CMS updates\n`)
})
```

You may use `cache.get()` and `cache.set()` to store a sync token or timestamp since your last sync.

```js
connector.event("updateNodes", async ({ models, cache }) => {
	console.log(`\nfetching CMS updates`)

	const lastSync = await cache.get(`LAST_DATA_SYNC`)
	const changes = await fetchJson(`${apiUrl}/changed-entities`, {
		since: lastSync,
	})
	await cache.set(`LAST_DATA_SYNC`, Date.now())

	// ...
	console.log(`finished fetching CMS updates\n`)
})
```

3. Iterate on the received data and create/update/delete nodes in the Connect DB

```js
connector.event("updateNodes", async ({ models }) => {
	console.log(`\nfetching CMS updates`)

	const changes = await fetchJson(`${apiUrl}/changed-entities`)

	for (const { type, entityType, entity } of changes) {
		switch (type) {
			// create/update is handled the same way in Connect
			case `create`:
			case `update`:
				// models is an object where the keys are node model names
				// ex: models.User.create(userNodeData)
				models[entityType].create(entity)
				break
			case `delete`:
				models[entityType].delete(entity)
				break
		}
	}

	console.log(`finished fetching CMS updates\n`)
})
```

### Congrats!

You now have a Connector which:

- dynamically builds models based on a remote CMS schema
- fetches all data
- fetches changed data sync the last time a sync happened
