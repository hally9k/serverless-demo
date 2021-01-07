import * as t from 'io-ts'
import { EventAction, Subscription } from './types'

export const BodyCodec = t.type({
  action: t.union([
    t.literal(EventAction.Connect),
    t.literal(EventAction.Disconnect),
    t.literal(EventAction.Default),
    t.literal(EventAction.Subscribe),
    t.literal(EventAction.Unsubscribe),
  ]),
  subscription: t.union([
    t.literal(Subscription.Time),
    t.literal(Subscription.Location),
  ]),
})

// type Body = t.TypeOf<typeof BodyCodec>

export const RequestContextCodec = t.type({
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

export const EventCodec = t.type({
  body: BodyCodec,
  requestContext: RequestContextCodec,
})

export const ConnectionEventCodec = t.type({
  requestContext: RequestContextCodec,
})
