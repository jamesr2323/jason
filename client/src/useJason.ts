import createActions from './createActions'
import createJasonReducers from './createJasonReducers'
import createPayloadHandler from './createPayloadHandler'
import createOptDis from './createOptDis'
import createServerActionQueue from './createServerActionQueue'
import restClient from './restClient'
import pruneIdsMiddleware from './pruneIdsMiddleware'

import { createConsumer } from "@rails/actioncable"
import { createEntityAdapter, createSlice, createReducer, configureStore } from '@reduxjs/toolkit'

import makeEager from './makeEager'
import { camelizeKeys } from 'humps'
import md5 from 'blueimp-md5'
import _ from 'lodash'
import React, { useState, useEffect } from 'react'

export default function useJason({ reducers, middleware = [], extraActions }: { reducers?: any, middleware?: any[], extraActions?: any }) {
  const [store, setStore] = useState(null as any)
  const [value, setValue] = useState(null as any)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    restClient.get('/jason/api/schema')
    .then(({ data: snakey_schema }) => {
      const schema = camelizeKeys(snakey_schema)
      console.debug({ schema })

      const serverActionQueue = createServerActionQueue()

      const consumer = createConsumer()
      const allReducers = {
        ...reducers,
        ...createJasonReducers(schema)
      }

      console.debug({ allReducers })

      const store = configureStore({ reducer: allReducers, middleware: [...middleware, pruneIdsMiddleware(schema)] })
      const dispatch = store.dispatch

      const optDis = createOptDis(schema, dispatch, restClient, serverActionQueue)
      const actions = createActions(schema, store, restClient, optDis, extraActions)
      const eager = makeEager(schema)

      let payloadHandlers = {}
      let configs = {}

      function handlePayload(payload) {
        const { md5Hash } = payload

        const handler = payloadHandlers[md5Hash]
        if (handler) {
          handler(payload)
        } else {
          console.warn("Payload arrived with no handler", payload, payloadHandlers)
        }
      }

      const subscription = (consumer.subscriptions.create({
        channel: 'Jason::Channel'
      }, {
        connected: () => {
          setConnected(true)
          dispatch({ type: 'jason/upsert', payload: { connected: true } })
          console.debug('Connected to ActionCable')

          // When AC loses connection - all state is lost, so we need to re-initialize all subscriptions
          _.values(configs).forEach(config => createSubscription(config))
        },
        received: payload => {
          handlePayload(payload)
          console.debug("ActionCable Payload received: ", payload)
        },
        disconnected: () => {
          setConnected(false)
          dispatch({ type: 'jason/upsert', payload: { connected: false } })
          console.warn('Disconnected from ActionCable')
        }
      }));

      function createSubscription(config) {
        // We need the hash to be consistent in Ruby / Javascript
        const hashableConfig = _({ conditions: {}, includes: {}, ...config }).toPairs().sortBy(0).fromPairs().value()
        const md5Hash = md5(JSON.stringify(hashableConfig))
        payloadHandlers[md5Hash] = createPayloadHandler({ dispatch, serverActionQueue, subscription, config })
        configs[md5Hash] = hashableConfig

        setTimeout(() => subscription.send({ createSubscription: hashableConfig }), 500)

        return {
          remove: () => removeSubscription(hashableConfig),
          md5Hash
        }
      }

      function removeSubscription(config) {
        subscription.send({ removeSubscription: config })
        const md5Hash = md5(JSON.stringify(config))
        delete payloadHandlers[md5Hash]
        delete configs[md5Hash]
      }

      setValue({
        actions: actions,
        subscribe: config => createSubscription(config),
        eager,
        handlePayload
      })
      setStore(store)
    })
  }, [])

  return [store, value, connected]
}