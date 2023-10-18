import { fetchJson, apiUrl, toModelFields, getCMSInfo } from "./utils.js"

// Documentation: https://sdk.netlify.com
import { NetlifyIntegration } from "@netlify/sdk"

const integration = new NetlifyIntegration()
const connector = integration.addConnector({
	typePrefix: "Workshop",
})

/**
 * Define your data models here.
 * https://sdk.netlify.com/connectors/develop/#define-your-data-model
 */
connector.model(async ({ define }) => {
	const { entityRoutes, getSwaggerProperties } = await getCMSInfo()

	for (const entityName of entityRoutes.keys()) {
		const properties = getSwaggerProperties(entityName)
		const fields = toModelFields(properties)

		define.nodeModel({
			name: entityName,
			fields,
		})
	}
})

/**
 * Fetch and store data from your API here.
 * https://sdk.netlify.com/connectors/develop/#create-all-nodes
 */
connector.event("createAllNodes", async ({ models }) => {
	console.log(`\nFetching all CMS data`)

	const { entityRoutes } = await getCMSInfo()

	for (const [name, model] of Object.entries(models)) {
		const entityUrl = entityRoutes.get(name).list

		const entities = await fetchJson(entityUrl)

		console.log(`  -> ${name} (${entities.length})`)
		model.create(entities)
	}

	console.log(`finished fetching all CMS data\n`)
})

/**
 * Fetch and store changed data from your API here.
 * https://sdk.netlify.com/connectors/develop/#update-nodes
 */
connector.event("updateNodes", async ({ models }) => {
	console.log(`\nfetching CMS updates`)

	const changes = await fetchJson(`${apiUrl}/changed-entities`)

	for (const { type, entityType, entity } of changes) {
		// log the type of update
		console.log(`  -> ${type}d ${entityType} "${entity.id}"`)

		// process changes
		switch (type) {
			// create/update is handled the same way in Connect
			case `create`:
			case `update`:
				models[entityType].create(entity)
				break
			case `delete`:
				models[entityType].delete(entity)
				break
		}
	}

	console.log(`finished fetching CMS updates\n`)
})

export { integration }
