import { Kinesis } from 'aws-sdk'
import util from 'util'
import winston from 'winston'

const log = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
})

const config = {
  kinesis: {
    // Region for the Amazon Kinesis stream.
    region: 'ap-southeast-2',
  },

  // The Amazon Kinesis stream to ingest clickstream data into. If the specified
  // stream doesn't exist, the producer application creates a new stream.
  stream: 'event-stream',

  // Total shards in the specified Amazon Kinesis stream.
  shards: 1,

  // The producer application batches clickstream records in to the size specified
  // here, and makes a single PutRecords API call to ingest all records to the
  // stream.
  recordsToWritePerBatch: 1,

  // If the producer application creates a stream, it has to wait for the stream to
  // transition to ACTIVE state before it can start putting data in it. This
  // specifies the wait time between consecutive describeStream calls.
  waitBetweenDescribeCallsInSeconds: 5,

  // Transactions per second for the PutRecords call to make sure the producer
  // doesn't hit throughput limits enforced by Amazon Kinesis.
  // For more information about throughput limits, see:
  // http://docs.aws.amazon.com/kinesis/latest/dev/service-sizes-and-limits.html
  putRecordsTps: 20,
}

const kinesis = new Kinesis({ region: config.kinesis.region })

const waitBetweenPutRecordsCallsInMilliseconds = config.putRecordsTps
  ? 10000 / config.putRecordsTps
  : 500

// Creates a new kinesis stream if one doesn't exist.
function _createStreamIfNotCreated(callback: any) {
  var params = {
    ShardCount: config.shards,
    StreamName: config.stream,
  }

  kinesis.createStream(params, function (err, _) {
    if (err) {
      // ResourceInUseException is returned when the stream is already created.
      if (err.code !== 'ResourceInUseException') {
        callback(err)
        return
      } else {
        log.info(
          util.format(
            '%s stream is already created! Re-using it.',
            config.stream
          )
        )
      }
    } else {
      log.info(
        util.format(
          '%s stream does not exist. Created a new stream with that name.',
          config.stream
        )
      )
    }

    // Poll to make sure stream is in ACTIVE state before start pushing data.
    _waitForStreamToBecomeActive(callback)
  })
}

// Checks current status of the stream.
function _waitForStreamToBecomeActive(callback: any) {
  kinesis.describeStream({ StreamName: config.stream }, function (err, data) {
    if (!err) {
      if (data.StreamDescription.StreamStatus === 'ACTIVE') {
        log.info('Current status of the stream is ACTIVE.')
        callback(null)
      } else {
        log.info(
          util.format(
            'Current status of the stream is %s.',
            data.StreamDescription.StreamStatus
          )
        )
        setTimeout(function () {
          _waitForStreamToBecomeActive(callback)
        }, 1000 * config.waitBetweenDescribeCallsInSeconds)
      }
    }
  })
}

// Sends batch of records to kinesis using putRecords API.
function _sendToKinesis(totalRecords: number, done: any) {
  if (totalRecords <= 0) {
    return
  }

  const records = []

  // Use putRecords API to batch more than one record.
  for (var i = 0; i < totalRecords; i++) {
    const data = { eventTime: Date.now() }

    const record = {
      Data: JSON.stringify(data),
      PartitionKey: '1',
    }

    records.push(record)
  }

  var recordsParams = {
    Records: records,
    StreamName: config.stream,
  }

  kinesis.putRecords(recordsParams, function (err, data) {
    if (err) {
      log.error(err)
    } else {
      log.info(
        util.format(
          'Sent %d records with %d failures.',
          records.length,
          data.FailedRecordCount
        )
      )
    }
  })

  done()
}

function _sendToKinesisRecursively(totalRecords: any) {
  setTimeout(function () {
    _sendToKinesis(totalRecords, function () {
      _sendToKinesisRecursively(totalRecords)
    })
  }, waitBetweenPutRecordsCallsInMilliseconds)
}

// * Run

log.info(
  util.format(
    'Configured wait between consecutive PutRecords call in milliseconds: %d',
    waitBetweenPutRecordsCallsInMilliseconds
  )
)
_createStreamIfNotCreated(function (err: any) {
  if (err) {
    log.error(util.format('Error creating stream: %s', err))
    return
  }
  _sendToKinesisRecursively(config.recordsToWritePerBatch)
})
