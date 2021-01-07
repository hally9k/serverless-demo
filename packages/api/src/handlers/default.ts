import { ApiGatewayManagementApi } from 'aws-sdk'
import { APIGatewayEvent } from 'aws-lambda'

const apigatewayManagementApi = new ApiGatewayManagementApi({
  apiVersion: '2018-11-29',
  endpoint: process.env.WS_URL?.replace('wss://', ''),
})

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
