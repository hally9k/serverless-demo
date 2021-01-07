'use strict'

import { ApiGatewayManagementApi, DynamoDB } from 'aws-sdk'
import { APIGatewayEvent } from 'aws-lambda'
import * as either from 'fp-ts/Either'
import { PathReporter } from 'io-ts/lib/PathReporter'

import { ConnectionEventCodec } from '../codecs'
import { EventAction } from '../types'

const ddb = new DynamoDB({ apiVersion: '2012-08-10' })
const apigatewayManagementApi = new ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: process.env.WS_URL?.replace('wss://', ''),
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
            connectionId: { S: event.right.requestContext.connectionId },
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
