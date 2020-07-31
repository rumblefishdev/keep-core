import { contracts, CONTRACT_DEPLOY_BLOCK_NUMBER } from "../contracts"
import { isEmptyArray } from "../utils/array.utils"
import { add } from "../utils/arithmetics.utils"
import moment from "moment"

export const commitTopUp = async (operator, onTransactionHashCallback) => {
  await contracts.stakingContract.methods
    .commitTopUp(operator)
    .send()
    .on("transactionHash", onTransactionHashCallback)
}

export const fetchAvailableTopUps = async (web3Context, operators) => {
  const availableTopUps = []

  if (isEmptyArray(operators)) {
    return availableTopUps
  }

  const toupUpsInitiatedByOperator = (
    await contracts.stakingContract.getPastEvents("TopUpInitiated", {
      fromBlock: CONTRACT_DEPLOY_BLOCK_NUMBER.stakingContract,
      filter: { operator: operators },
    })
  ).reduce(reduceByOperator, {})

  const topUpsCompletedByOperator = (
    await contracts.stakingContract.getPastEvents("TopUpCompleted", {
      fromBlock: CONTRACT_DEPLOY_BLOCK_NUMBER.stakingContract,
      filter: { operator: operators },
    })
  ).reduce(reduceByOperator, {})

  for (const operator of operators) {
    const topUpsInitiated = toupUpsInitiatedByOperator[operator]
    const topUpsCompleted = topUpsCompletedByOperator[operator]

    const latestTopUpCompletedEvent = !isEmptyArray(topUpsCompleted)
      ? [...topUpsCompleted].pop()
      : undefined

    if (!isEmptyArray(topUpsInitiated)) {
      const availableOperatorTopUps = latestTopUpCompletedEvent
        ? topUpsInitiated.filter(
            filterByAfterLatestCompletedTopUp(latestTopUpCompletedEvent)
          )
        : topUpsInitiated
      const availableTopUpAmount = availableOperatorTopUps.reduce(
        reduceAmount,
        0
      )
      if (availableTopUpAmount > 0) {
        const createdAt = (
          await web3Context.eth.getBlock(
            topUpsInitiated[topUpsInitiated.length - 1].blockNumber
          )
        ).timestamp

        availableTopUps.push({
          operatorAddress: operator,
          availableTopUpAmount,
          createdAt,
        })
      }
    }
  }

  return availableTopUps
}

const reduceByOperator = (result, event) => {
  const {
    returnValues: { operator },
  } = event

  ;(result[operator] = result[operator] || []).push(event)

  return result
}

const reduceAmount = (result, { returnValues: { topUp } }) => {
  return add(result, topUp)
}

const filterByAfterLatestCompletedTopUp = (latestTopUpCompletedEvent) => (
  initiatedEvent
) => {
  const isAfterLatestCompletedTopUpBlock =
    initiatedEvent.blockNumber > latestTopUpCompletedEvent.blockNumber
  const isAfterLatestCompletedTopUpTransactionInBlock =
    latestTopUpCompletedEvent.blockNumber === initiatedEvent.blockNumber &&
    initiatedEvent.transactionIndex > latestTopUpCompletedEvent.transactionIndex

  return (
    isAfterLatestCompletedTopUpBlock ||
    isAfterLatestCompletedTopUpTransactionInBlock
  )
}
