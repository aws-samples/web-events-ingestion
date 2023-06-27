// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import { Buffer } from 'node:buffer'

export const handler = async (event) => {
  console.log('event', JSON.stringify(event, null, 2))
  const result = []
  for (const record of event.records) {
    const buffer = Buffer.from(record.data, 'base64')
    const data = buffer.toString('utf-8')
    const object = JSON.parse(data)
    object.random = Math.random()
    console.log('object: ', object)
    const base64 = Buffer.from(JSON.stringify(object)).toString('base64')
    console.log('base64: ', base64)
    result.push({ recordId: record.recordId, result: 'Ok', data: base64 })
  }
  console.log('result: ', result)
  return result
}
