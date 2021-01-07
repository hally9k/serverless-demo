import { DynamoDB } from 'aws-sdk'
;(async function go() {
  const ddb = new DynamoDB({
    apiVersion: '2012-08-10',
    region: 'ap-southeast-2',
  })

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
})()
