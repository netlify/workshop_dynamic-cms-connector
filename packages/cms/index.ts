import z from "zod"
import { buildJsonSchemas, register } from "fastify-zod"
import fastify from "fastify"

const Entity = z.object({
	id: z.string(),
})

const UserEntity = Entity.extend({
	username: z.string(),
	email: z.string(),
	password: z.string(),
	authoredPages: z.array(z.lazy(() => PageEntity.partial())),
	type: z.literal(`UserEntity`),
})
const PageEntity = Entity.extend({
	path: z.string(),
	description: z.string(),
	title: z.string(),
	author: z.lazy(() => UserEntity.partial()),
	type: z.literal(`PageEntity`),
})

const Entities = z.array(
	z.object({
		entityName: z.string(),
		singlePath: z.string(),
		listPath: z.string(),
	}),
)

const Change = z.object({
	type: z.union([
		z.literal(`create`),
		z.literal(`update`),
		z.literal(`delete`),
	]),
	entityType: z.string(),
	entity: z.any(),
})

const models = {
	PageEntity,
	PageEntityList: z.array(PageEntity),
	UserEntity,
	UserEntityList: z.array(UserEntity),
	Entity,
	EntityList: z.array(Entity),
	Entities,
	Change,
	ChangeList: z.array(Change),
}

import type { FastifyZod } from "fastify-zod"
import { writeFile } from "fs/promises"
import { join } from "path"
import { faker } from "@faker-js/faker"

declare module "fastify" {
	interface FastifyInstance {
		readonly zod: FastifyZod<typeof models>
	}
}

const f = fastify({
	ignoreTrailingSlash: true,
	ignoreDuplicateSlashes: true,
})

await register(f, {
	jsonSchemas: buildJsonSchemas(models),
	swaggerOptions: {
		// See https://github.com/fastify/fastify-swagger
	},
	swaggerUiOptions: {
		// See https://github.com/fastify/fastify-swagger-ui
		routePrefix: "/documentation",
		uiConfig: {
			docExpansion: "list",
			deepLinking: false,
		},
		uiHooks: {
			onRequest: function(request, reply, next) {
				next()
			},
			preHandler: function(request, reply, next) {
				next()
			},
		},
		staticCSP: true,
		transformStaticCSP: (header) => header,
		transformSpecification: (swaggerObject, request, reply) => {
			return swaggerObject
		},
		transformSpecificationClone: true,
	},
	transformSpec: {},
})

const initialUser = {
	id: `1`,
	type: `UserEntity`,
	username: `Tyler`,
	email: `tyler.barnes@netlify.com`,
	password: `oh noe`,
	authoredPages: [
		{
			id: `1`,
		},
	],
}

const state = {
	UserEntity: z.array(UserEntity).parse([initialUser]),
	PageEntity: z.array(PageEntity).parse([
		{
			id: `1`,
			type: `PageEntity`,
			path: `/page/1`,
			description: `A page!`,
			title: `Hello world`,
			author: {
				id: `1`,
				type: `UserEntity`,
			},
		},
		...Array(5).fill(null).map(makeRandomPage),
	]),
}

export type EntityMap = z.infer<typeof Entities>

const entityMap: EntityMap = []

for (const entityName of Object.keys(state)) {
	const singlePath = `/entity/single/${entityName}/:id`
	const listPath = `/entity/list/${entityName}/`

	entityMap.push({
		entityName,
		singlePath,
		listPath,
	})
	// single entity
	f.zod.get(
		singlePath,
		{
			operationId: `getSingle${entityName}`,
			// @ts-ignore
			params: entityName,
			response: {
				200: `${entityName}` as any,
			},
		},
		// @ts-ignore
		async ({ params: { id } }, reply) => {
			const entity = state[entityName].find((e) => e.id === id)

			if (!entity) {
				reply.code(404)
				return {
					id,
					message: `${entityName} not found`,
				}
			}

			return entity
		},
	)

	// entity list
	f.zod.get(
		listPath,
		{
			operationId: `getList${entityName}`,
			// params:
			response: {
				200: `${entityName}List` as any,
			},
		},
		async ({ }, reply) => {
			const entities = state[entityName]

			if (!entities) {
				reply.code(404)
				return {
					message: `${entityName} list not found`,
				}
			}

			return entities
		},
	)
}

function makeRandomPage() {
	return PageEntity.parse({
		id: faker.string.alphanumeric(8),
		title: faker.lorem.sentence(5),
		path: `/page/${faker.lorem.word()}`,
		author: initialUser,
		description: faker.lorem.sentence(1),
		type: `PageEntity`,
	})
}

// change list
f.zod.get(
	`/changed-entities`,
	{
		operationId: `getUpdates`,
		response: {
			200: `ChangeList`,
		},
	},
	async () => {
		try {
			const numUpdates = Math.floor(Math.random() * 5) + 1
			const updateTypes = ["create", "create", "update", "update", "delete"]

			const changes: Array<z.infer<typeof Change>> = []

			const helloWorldIndex = state.PageEntity.findIndex((p) =>
				p.title.startsWith(`Hello world`),
			)

			if (helloWorldIndex > -1) {
				state.PageEntity[
					helloWorldIndex
				].title = `Hello world! updated ${Date.now()}`

				changes.push({
					type: `update`,
					entityType: `PageEntity`,
					entity: {
						...state.PageEntity[helloWorldIndex],
					},
				})
			}

			for (let i = 0; i < numUpdates; i++) {
				const updateType =
					updateTypes[Math.floor(Math.random() * updateTypes.length)]

				const randomPageIndex = Math.floor(
					Math.random() * state.PageEntity.length,
				)
				const randomPage = state.PageEntity[randomPageIndex]

				if (randomPage.id === `1`) continue

				switch (updateType) {
					case "create":
						const newPage = makeRandomPage()

						state.PageEntity.push(newPage)
						state.UserEntity[0].authoredPages.push(newPage)
						changes.push({
							type: updateType,
							entity: newPage,
							entityType: `PageEntity`,
						})
						break
					case "update":
						if (!randomPage) {
							break
						}
						state.PageEntity[randomPageIndex] = {
							...randomPage,
							title: randomPage.title + ` updated ${Date.now()}`,
						}
						changes.push({
							type: `update`,
							entityType: `PageEntity`,
							entity: {
								...state.PageEntity[randomPageIndex],
							},
						})
						break
					case "delete":
						if (!randomPage) break
						changes.push({
							type: updateType,
							entity: {
								id: randomPage.id,
							},
							entityType: `PageEntity`,
						})
						delete state.PageEntity[randomPageIndex]
						state.PageEntity = state.PageEntity.filter(Boolean)

						break
				}
			}

			return changes
		} catch (e) {
			console.error(e)
			throw e
		}
	},
)

f.zod.get(
	`/entity-map/`,
	{
		operationId: `getEntities`,
		response: {
			200: `Entities`,
		},
	},
	async () => {
		return models.Entities.parse(entityMap)
	},
)
f.listen(
	{
		port: 4848,
	},
	() => {
		console.log(
			`\n\nMock CMS started!\n\n  Swagger UI: http://localhost:4848/documentation/static/index.html\n  Schema endpoint: http://localhost:4848/documentation_transformed/json`,
		)
	},
)

const transformedSpecJson = await f
	.inject({
		method: `get`,
		url: `/documentation_transformed/json`,
	})
	.then((res) => res.body)
	.catch((e) => console.error(e))

if (transformedSpecJson)
	await writeFile(
		join(process.cwd(), `openapi.transformed.json`),
		transformedSpecJson,
		{ encoding: `utf-8` },
	)
