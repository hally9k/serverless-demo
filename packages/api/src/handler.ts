'use strict'

import { ApiGatewayManagementApi, DynamoDB } from 'aws-sdk'
import { APIGatewayEvent } from 'aws-lambda'
import * as t from 'io-ts'
import * as either from 'fp-ts/Either'
import { PathReporter } from 'io-ts/lib/PathReporter'

const ddb = new DynamoDB({ apiVersion: '2012-08-10' })
const apigatewayManagementApi = new ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: process.env.WS_URL?.replace('wss://', ''),
})

enum EventAction {
  Connect = '$connect',
  Disconnect = '$disconnect',
  Default = '$default',
  Subscribe = 'subscribe',
  Unsubscribe = 'unsubscribe',
}

const BodyCodec = t.type({
  action: t.union([
    t.literal(EventAction.Connect),
    t.literal(EventAction.Disconnect),
    t.literal(EventAction.Default),
    t.literal(EventAction.Subscribe),
    t.literal(EventAction.Unsubscribe),
  ]),
})

// type Body = t.TypeOf<typeof BodyCodec>

const RequestContextCodec = t.type({
  connectionId: t.string,
  routeKey: t.union([
    t.literal(EventAction.Connect),
    t.literal(EventAction.Disconnect),
    t.literal(EventAction.Default),
    t.literal(EventAction.Subscribe),
    t.literal(EventAction.Unsubscribe),
  ]),
})

// type RequestContext = t.TypeOf<typeof RequestContextCodec>

const EventCodec = t.type({
  body: BodyCodec,
  requestContext: RequestContextCodec,
})

const ConnectionEventCodec = t.type({
  requestContext: RequestContextCodec,
})

module.exports.connectionHandler = async (eventInput: APIGatewayEvent) => {
  console.log(eventInput)
  const event = ConnectionEventCodec.decode(eventInput)

  if (either.isLeft(event)) {
    return {
      status: 500,
      body: PathReporter.report(event).join('\n\t'),
    }
  }

  switch (event.right.requestContext.routeKey) {
    case EventAction.Connect: {
      return {
        statusCode: 200,
        body: event.right.requestContext.routeKey,
      }
    }
    case EventAction.Disconnect: {
      const res = await ddb
        .deleteItem({
          TableName: 'subscriptionsTable',
          Key: {
            subscriptionId: { S: event.right.requestContext.connectionId },
          },
        })
        .promise()

      if (res.$response.error) {
        console.log(res.$response.error)

        return {
          statusCode: 500,
          body: res.$response.error,
        }
      }

      const params = {
        ConnectionId: event.right.requestContext.connectionId,
        Data: `disconnection successful`,
      }

      await apigatewayManagementApi.postToConnection(params).promise()

      return {
        statusCode: 200,
        body: event.right.requestContext.routeKey,
      }
    }
    default: {
      return {
        statusCode: 200,
        body: event.right.requestContext.routeKey,
      }
    }
  }
}

module.exports.defaultHandler = async (eventInput: APIGatewayEvent) => {
  console.log(eventInput)

  const event = { ...eventInput, body: JSON.parse(`${eventInput.body}`) }

  const params = {
    ConnectionId: `${event.requestContext.connectionId}`,
    Data: `Action: "${event.body?.action}" not supported`,
  }

  await apigatewayManagementApi.postToConnection(params).promise()

  return {
    statusCode: 404,
    body: `Action: "${event.body?.action}" not supported`,
  }
}

module.exports.subscriptionHandler = async (eventInput: APIGatewayEvent) => {
  const event = EventCodec.decode({
    ...eventInput,
    body: JSON.parse(`${eventInput.body}`),
  })

  if (either.isLeft(event)) {
    return {
      status: 500,
      body: PathReporter.report(event).join('\n\t'),
    }
  }

  if (either.isRight(event)) {
    switch (event.right.body.action) {
      case EventAction.Subscribe: {
        const res = await ddb
          .putItem({
            TableName: 'subscriptionsTable',
            Item: {
              subscriptionId: { S: event.right.requestContext.connectionId },
            },
          })
          .promise()

        if (res.$response.error) {
          console.log(res.$response.error)

          return {
            statusCode: 500,
            body: res.$response.error,
          }
        }

        const params = {
          ConnectionId: event.right.requestContext.connectionId,
          Data: `subscription successful`,
        }

        await apigatewayManagementApi.postToConnection(params).promise()

        break
      }

      case EventAction.Unsubscribe: {
        const res = await ddb
          .deleteItem({
            TableName: 'subscriptionsTable',
            Key: {
              subscriptionId: { S: event.right.requestContext.connectionId },
            },
          })
          .promise()

        if (res.$response.error) {
          console.log(res.$response.error)

          return {
            statusCode: 500,
            body: res.$response.error,
          }
        }

        const params = {
          ConnectionId: event.right.requestContext.connectionId,
          Data: `unsubscription successful`,
        }

        await apigatewayManagementApi.postToConnection(params).promise()

        break
      }
    }
  }

  return {
    statusCode: 200,
  }
}

// module.exports.cronHandler = async () => {
//   for (let i = 0; i < 60; ++i) {
//     const startTime = Date.now()

//     const res = await ddb
//       .scan({
//         TableName: 'subscriptionsTable',
//       })
//       .promise()

//     if (res.$response.error) {
//       console.log(res.$response.error)

//       return {
//         statusCode: 200,
//       }
//     }

//     res.Items?.forEach((attrMap) => {
//       console.log(attrMap)

//       const params = {
//         ConnectionId: `${attrMap.subscriptionId.S}`,
//         Data: new Date().toISOString(),
//       }

//       apigatewayManagementApi.postToConnection(params).promise()
//     })

//     const endTime = Date.now()

//     const execTime = endTime - startTime

//     console.log(`execTime: `, execTime)

//     await new Promise<void>((resolve) => {
//       setTimeout(() => {
//         resolve()
//       }, 1000 - execTime)
//     })
//   }

//   return {
//     statusCode: 200,
//   }
// }
