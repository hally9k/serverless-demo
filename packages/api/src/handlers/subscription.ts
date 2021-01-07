'use strict'

import { ApiGatewayManagementApi, DynamoDB } from 'aws-sdk'
import { APIGatewayEvent } from 'aws-lambda'
import * as either from 'fp-ts/Either'
import { PathReporter } from 'io-ts/lib/PathReporter'
import { EventCodec } from '../codecs'
import { EventAction } from '../types'

const ddb = new DynamoDB({ apiVersion: '2012-08-10' })
const apigatewayManagementApi = new ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: process.env.WS_URL?.replace('wss://', ''),
})

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
              connectionId: { S: event.right.requestContext.connectionId },
              subscriptionId: { S: event.right.body.subscription },
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
              connectionId: { S: event.right.requestContext.connectionId },
              subscriptionId: { S: event.right.body.subscription },
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
