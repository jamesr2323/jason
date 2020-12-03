import { apply_patch } from 'jsonpatch'
import { camelizeKeys } from 'humps'
import pluralize from 'pluralize'
import _ from 'lodash'

function diffSeconds(dt2, dt1) {
  var diff =(dt2.getTime() - dt1.getTime()) / 1000
  return Math.abs(Math.round(diff))
}

export default function createPayloadHandler(dispatch, subscription, model, config) {
  console.log({ model, config })
  let payload = {}
  let idx = 0
  let patchQueue = {}

  let lastCheckAt = new Date()
  let updateDeadline = null as Date | null
  let checkInterval

  function getPayload() {
    console.log({ getPayload: model, subscription })
    subscription.send({ getPayload: { model, config } })
  }

  const tGetPayload = _.throttle(getPayload, 10000)

  function dispatchPayload() {
    const includeModels = (config.includeModels || []).map(m => _.camelCase(m))

    console.log("Dispatching", { payload, includeModels })

    includeModels.forEach(m => {
      const subPayload = _.flatten(_.compact(camelizeKeys(payload).map(instance => instance[m])))
      console.log({ type: `${pluralize(m)}/upsertMany`, payload: subPayload })
      dispatch({ type: `${pluralize(m)}/upsertMany`, payload: subPayload })
    })

    dispatch({ type: `${pluralize(model)}/upsertMany`, payload: camelizeKeys(payload) })
  }

  function processQueue() {
    console.log({ idx, patchQueue })
    lastCheckAt = new Date()
    if (patchQueue[idx]) {
      payload = apply_patch(payload, patchQueue[idx])
      if (patchQueue[idx]) {
        dispatchPayload()
      }
      delete patchQueue[idx]
      idx++
      updateDeadline = null
      processQueue()
    // If there are updates in the queue that are ahead of the index, some have arrived out of order
    // Set a deadline for new updates before it declares the update missing and refetches.
    } else if (_.keys(patchQueue).length > 0 && !updateDeadline) {
      var t = new Date()
      t.setSeconds(t.getSeconds() + 3)
      updateDeadline = t
      setTimeout(processQueue, 3100)
    // If more than 10 updates in queue, or deadline has passed, restart
    } else if (_.keys(patchQueue).length > 10 || (updateDeadline && diffSeconds(updateDeadline, new Date()) < 0)) {
      tGetPayload()
      updateDeadline = null
    }
  }

  function handlePayload(data) {
    const { value, idx: newIdx, diff, latency, type } = data
    console.log({ data })

    if (type === 'payload') {
      if (!value) return null;

      payload = value
      dispatchPayload()
      idx = newIdx + 1
      // Clear any old changes left in the queue
      patchQueue= _.pick(patchQueue, _.keys(patchQueue).filter(k => k > newIdx + 1))
      return
    }

    patchQueue[newIdx] = diff

    processQueue()

    if (diffSeconds((new Date()), lastCheckAt) >= 3) {
      lastCheckAt = new Date()
      console.log('Interval lost. Pulling from server')
      tGetPayload()
    }
  }

  return handlePayload
}