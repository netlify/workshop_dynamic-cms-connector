import SwaggerParser from "@apidevtools/swagger-parser"

import type { OpenAPIV3_1, OpenAPIV2, IJsonSchema } from "openapi-types"
import type { EntityMap } from "cms"

export const apiUrl = `http://localhost:4848`

// Fetches an OpenAPI/Swagger schema from the CMS + a list of entities and where to
// fetch them.
export async function getCMSInfo() {
	const swaggerSchema = (await SwaggerParser.dereference(
		`${apiUrl}/documentation_transformed/json`,
	)) as OpenAPIV2.SchemaObject

	const routes = (await (
		await fetch(`${apiUrl}/entity-map`)
	).json()) as EntityMap

	const entityRoutes = new Map(
		routes.map((route) => [
			route.entityName,
			{
				list: `${apiUrl}${route.listPath}`,
				single: `${apiUrl}${route.singlePath}`,
			},
		]),
	)

	return {
		entityRoutes,
		getSwaggerProperties: function(entityName: string) {
			const swaggerProperties =
				swaggerSchema.definitions[`Schema_${entityName}`]?.properties

			return swaggerProperties
		},
	}
}

// Converts swagger properties to Connect Model field definitions
export function toModelFields(swaggerProperties: IJsonSchema) {
	const fields = {}

	for (const [swaggerFieldName, swaggerProperty] of Object.entries(
		swaggerProperties,
	)) {
		// id field is handled by the SDK automatically
		if (swaggerFieldName === `id`) continue

		// relationship fields
		if (swaggerProperty.type === `object` || swaggerProperty.type === `array`) {
			fields[swaggerFieldName] = {
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

	return fields
}

// Helper to grab the "const" type name from a OpenAPI/Swagger field definition
function getModelTypeName(fieldDef: IJsonSchema) {
	const properties =
		// properties is in a different place for object
		fieldDef.type === `object`
			? fieldDef.properties
			: // than where it is for array
			fieldDef.type === `array`
				? (fieldDef.items as IJsonSchema)?.properties
				: null

	return (properties?.type as OpenAPIV3_1.BaseSchemaObject)?.const
}

export async function fetchJson(url: string) {
	const r = await fetch(url)
	return r.json()
}
