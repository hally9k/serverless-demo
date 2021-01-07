'use strict'

import { ApiGatewayManagementApi, DynamoDB } from 'aws-sdk'
import { KinesisStreamEvent } from 'aws-lambda'
import base64 from 'base-64'

const ddb = new DynamoDB({ apiVersion: '2012-08-10' })
const apigatewayManagementApi = new ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: process.env.WS_URL?.replace('wss://', ''),
})

module.exports.streamHandler = async (eventInput: KinesisStreamEvent) => {
  const data: string[] = eventInput.Records.map((record: any) =>
    base64.decode(record.kinesis.data)
  )

  console.log(JSON.stringify(data, null, 2))

  const res = await ddb
    .query({
      TableName: 'subscriptionsTable',
      IndexName: 'subscription-index',
      KeyConditionExpression: '#s = :sid',
      ExpressionAttributeNames: {
        '#s': 'subscriptionId',
      },
      ExpressionAttributeValues: {
        ':sid': { S: 'time' },
      },
    })
    // .scan({
    //   TableName: 'subscriptionsTable',
    // })
    .promise()

  console.log(JSON.stringify(res, null, 2))

  if (res.$response.error) {
    console.log(res.$response.error)

    return {
      statusCode: 200,
    }
  }

  const promises = res.Items?.map(async (attrMap) => {
    console.log(attrMap)

    const params = {
      ConnectionId: `${attrMap.connectionId.S}`,
      Data: `${data}`,
    }

    await apigatewayManagementApi.postToConnection(params).promise()
  })

  if (!promises) {
    return {
      statusCode: 500,
    }
  }

  await Promise.all(promises)

  return {
    statusCode: 200,
  }
}
