import React, { createRef, ReactNode, useEffect, useMemo, useRef, useState } from 'react'

import { Percent } from '@raydium-io/raydium-sdk'

import BN from 'bn.js'
import { twMerge } from 'tailwind-merge'

import useAppSettings from '@/application/appSettings/useAppSettings'
import useFarms from '@/application/farms/useFarms'
import useLiquidityAmmSelector from '@/application/liquidity/feature/useLiquidityAmmSelector'
import useLiquidityAmountCalculator from '@/application/liquidity/feature/useLiquidityAmountCalculator'
import useLiquidityCoin1Filler from '@/application/liquidity/feature/useLiquidityCoin1Filler'
import useLiquidityUrlParser from '@/application/liquidity/feature/useLiquidityUrlParser'
import txAddLiquidity from '@/application/liquidity/transaction/txAddLiquidity'
import useLiquidity from '@/application/liquidity/useLiquidity'
import { routeTo } from '@/application/routeTools'
import useToken from '@/application/token/useToken'
import { SOL_BASE_BALANCE, SOLDecimals } from '@/application/token/utils/quantumSOL'
import useWallet from '@/application/wallet/useWallet'
import Button, { ButtonHandle } from '@/components/Button'
import Card from '@/components/Card'
import CoinAvatarPair from '@/components/CoinAvatarPair'
import CoinInputBox, { CoinInputBoxHandle } from '@/components/CoinInputBox'
import Col from '@/components/Col'
import Collapse from '@/components/Collapse'
import CyberpunkStyleCard from '@/components/CyberpunkStyleCard'
import { SearchAmmDialog } from '@/components/dialogs/SearchAmmDialog'
import FadeInStable, { FadeIn } from '@/components/FadeIn'
import Icon from '@/components/Icon'
import Input from '@/components/Input'
import Link from '@/components/Link'
import List from '@/components/List'
import PageLayout from '@/components/PageLayout'
import RefreshCircle from '@/components/RefreshCircle'
import Row from '@/components/Row'
import Tabs from '@/components/Tabs'
import Tooltip from '@/components/Tooltip'
import { addItem, removeItem, shakeFalsyItem } from '@/functions/arrayMethods'
import copyToClipboard from '@/functions/dom/copyToClipboard'
import formatNumber from '@/functions/format/formatNumber'
import toPubString from '@/functions/format/toMintString'
import { toTokenAmount } from '@/functions/format/toTokenAmount'
import { gte, isMeaningfulNumber, lt } from '@/functions/numberish/compare'
import { div, mul } from '@/functions/numberish/operations'
import { toString } from '@/functions/numberish/toString'
import createContextStore from '@/functions/react/createContextStore'
import useLocalStorageItem from '@/hooks/useLocalStorage'
import useToggle from '@/hooks/useToggle'
import { HexAddress } from '@/types/constants'

import { Checkbox } from '../../components/Checkbox'
import { RemoveLiquidityDialog } from '../../components/dialogs/RemoveLiquidityDialog'
import TokenSelectorDialog from '../../components/dialogs/TokenSelectorDialog'
import { Badge } from '@/components/Badge'

const { ContextProvider: LiquidityUIContextProvider, useStore: useLiquidityContextStore } = createContextStore({
  hasAcceptedPriceChange: false,
  coinInputBox1ComponentRef: createRef<CoinInputBoxHandle>(),
  coinInputBox2ComponentRef: createRef<CoinInputBoxHandle>(),
  liquidityButtonComponentRef: createRef<ButtonHandle>()
})

export default function Liquidity() {
  return (
    <LiquidityUIContextProvider>
      <LiquidityEffect />
      <PageLayout mobileBarTitle="Liquidity" metaTitle="Liquidity - Raydium">
        <LiquidityPageHead />
        <LiquidityCard />
        <UserLiquidityExhibition />
        <CreatePoolCardEntry />
      </PageLayout>
    </LiquidityUIContextProvider>
  )
}

function LiquidityEffect() {
  useLiquidityUrlParser()
  useLiquidityCoin1Filler()
  useLiquidityAmmSelector()
  //  auto fresh  liquidity's coin1Amount and coin2Amount
  useLiquidityAmountCalculator()
  return null
}

// const availableTabValues = ['Swap', 'Liquidity'] as const
function LiquidityPageHead() {
  return (
    <Row className="mb-12 mobile:mb-2 self-center">
      <Tabs
        currentValue={'Liquidity'}
        values={['Swap', 'Liquidity']}
        onChange={(newTab) => {
          // setActiveTabValue(newTab)
          if (newTab === 'Swap') {
            routeTo('/swap')
          }
        }}
      />
    </Row>
  )
}

function useLiquidityWarning() {
  const currentJsonInfo = useLiquidity((s) => s.currentJsonInfo)
  const coin1 = useLiquidity((s) => s.coin1)
  const coin2 = useLiquidity((s) => s.coin2)
  const [userConfirmedList, setUserConfirmedList] = useLocalStorageItem<HexAddress /* ammId */[]>(
    'USER_CONFIRMED_LIQUIDITY_AMM_LIST'
  )
  // permanent state
  const hasUserPermanentConfirmed = currentJsonInfo && userConfirmedList?.includes(currentJsonInfo.id)

  // temporary state
  const [hasUserTemporaryConfirmed, setHasUserTemporaryConfirmed] = useState(false)

  useEffect(() => {
    if (currentJsonInfo) {
      setHasUserTemporaryConfirmed(false)
    }
  }, [currentJsonInfo])

  const toggleTemporarilyConfirm = (checkState: boolean) => setHasUserTemporaryConfirmed(checkState)
  const togglePermanentlyConfirm = (checkState: boolean, ammId: string) => {
    if (checkState) {
      setUserConfirmedList((old) => addItem(old ?? [], ammId))
    } else {
      setUserConfirmedList((old) => removeItem(old ?? [], ammId))
    }
  }
  // box state
  const [isPanelShown, setIsPanelShown] = useState(false)

  const needPanelShown = !hasUserPermanentConfirmed && !hasUserTemporaryConfirmed && Boolean(currentJsonInfo)

  useEffect(() => {
    if (!coin1 || !coin2) {
      setIsPanelShown(false)
    }
  }, [coin1, coin2])

  useEffect(() => {
    if (needPanelShown) {
      setIsPanelShown(true)
    }
  }, [needPanelShown])

  const closePanel = () => setIsPanelShown(false)

  return {
    closePanel,
    toggleTemporarilyConfirm,
    togglePermanentlyConfirm,
    hasUserPermanentConfirmed,
    hasUserTemporaryConfirmed,
    needConfirmPanel: isPanelShown
  }
}

function LiquidityConfirmRiskPanel({
  className,
  isPanelOpen,
  onTemporarilyConfirm,
  onPermanentlyConfirm
}: {
  className?: string
  isPanelOpen?: boolean
  onTemporarilyConfirm?: (checkState: boolean) => void
  onPermanentlyConfirm?: (checkState: boolean) => void
}) {
  return (
    <FadeInStable show={isPanelOpen}>
      <div className={twMerge('bg-[#141041] rounded-xl py-3 px-6 mobile:px-4', className)}>
        <div className="text-sm">
          I have read{' '}
          <Link href="https://raydium.gitbook.io/raydium/exchange-trade-and-swap/liquidity-pools">
            Raydium's Liquidity Guide
          </Link>{' '}
          and understand the risks involved with providing liquidity and impermanent loss.
        </div>

        <Checkbox
          checkBoxSize="sm"
          className="my-2 w-max"
          onChange={onTemporarilyConfirm}
          label={<div className="text-sm italic text-[rgba(171,196,255,0.5)]">Confirm</div>}
        />

        <Checkbox
          checkBoxSize="sm"
          className="my-2 w-max"
          onChange={onPermanentlyConfirm}
          label={<div className="text-sm italic text-[rgba(171,196,255,0.5)]">Do not warn again for this pool</div>}
        />
      </div>
    </FadeInStable>
  )
}

function LiquidityCard() {
  const { connected } = useWallet()
  const [isCoinSelectorOn, { on: turnOnCoinSelector, off: turnOffCoinSelector }] = useToggle()
  // it is for coin selector panel
  const [targetCoinNo, setTargetCoinNo] = useState<'1' | '2'>('1')

  const checkWalletHasEnoughBalance = useWallet((s) => s.checkWalletHasEnoughBalance)

  const {
    coin1,
    coin1Amount,
    coin2,
    coin2Amount,
    currentJsonInfo,
    currentHydratedInfo,
    isSearchAmmDialogOpen,
    refreshLiquidity
  } = useLiquidity()
  const refreshTokenPrice = useToken((s) => s.refreshTokenPrice)

  const { coinInputBox1ComponentRef, coinInputBox2ComponentRef, liquidityButtonComponentRef } =
    useLiquidityContextStore()
  const hasFoundLiquidityPool = useMemo(() => Boolean(currentJsonInfo), [currentJsonInfo])
  const hasHydratedLiquidityPool = useMemo(() => Boolean(currentHydratedInfo), [currentHydratedInfo])

  // TODO: card actually don't need `toggleTemporarilyConfirm()` and `togglePermanentlyConfirm()`, so use React.Context may be better
  const {
    closePanel,
    needConfirmPanel,
    hasUserTemporaryConfirmed,
    hasUserPermanentConfirmed,
    toggleTemporarilyConfirm,
    togglePermanentlyConfirm
  } = useLiquidityWarning()

  const haveEnoughCoin1 = useMemo(
    () => coin1 && checkWalletHasEnoughBalance(toTokenAmount(coin1, coin1Amount, { alreadyDecimaled: true })),
    [coin1, coin1Amount, checkWalletHasEnoughBalance]
  )

  const haveEnoughCoin2 = useMemo(
    () => coin2 && checkWalletHasEnoughBalance(toTokenAmount(coin2, coin2Amount, { alreadyDecimaled: true })),
    [coin2, coin2Amount, checkWalletHasEnoughBalance]
  )

  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    useLiquidity.setState({
      scrollToInputBox: () => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }, [])

  const isApprovePanelShown = useAppSettings((s) => s.isApprovePanelShown)
  return (
    <CyberpunkStyleCard
      domRef={cardRef}
      wrapperClassName="w-[min(456px,100%)] self-center cyberpunk-bg-light"
      className="py-8 pt-4 px-6 mobile:py-5"
      size="lg"
      style={{
        background:
          'linear-gradient(140.14deg, rgba(0, 182, 191, 0.15) 0%, rgba(27, 22, 89, 0.1) 86.61%), linear-gradient(321.82deg, #18134D 0%, #1B1659 100%)'
      }}
    >
      {/* input twin */}
      <>
        <CoinInputBox
          className="mt-5"
          disabled={isApprovePanelShown}
          componentRef={coinInputBox1ComponentRef}
          value={coin1Amount}
          haveHalfButton
          haveCoinIcon
          canSelect
          topLeftLabel=""
          onTryToTokenSelect={() => {
            turnOnCoinSelector()
            setTargetCoinNo('1')
          }}
          onUserInput={(amount) => {
            useLiquidity.setState({ coin1Amount: amount, focusSide: 'coin1' })
          }}
          onEnter={(input) => {
            if (!input) return
            if (!coin2) coinInputBox2ComponentRef.current?.selectToken?.()
            if (coin2 && coin2Amount) liquidityButtonComponentRef.current?.click?.()
          }}
          token={coin1}
        />

        {/* swap button */}
        <div className="relative h-8 my-4">
          <Row
            className={`absolute h-full items-center transition-all ${
              hasHydratedLiquidityPool ? 'left-4' : 'left-1/2 -translate-x-1/2'
            }`}
          >
            <Icon heroIconName="plus" className="p-1 mr-4 mobile:mr-2 text-[#39D0D8]" />
            <FadeIn>{hasHydratedLiquidityPool && <LiquidityCardPriceIndicator className="w-max" />}</FadeIn>
          </Row>
          <Row className="absolute right-0 items-center">
            <Icon
              size="sm"
              heroIconName="search"
              className="p-2 frosted-glass frosted-glass-teal rounded-full mr-4 clickable text-[#39D0D8] select-none"
              onClick={() => {
                useLiquidity.setState({ isSearchAmmDialogOpen: true })
              }}
            />
            <RefreshCircle
              run={!isApprovePanelShown}
              refreshKey="liquidity/add"
              popPlacement="right-bottom"
              freshFunction={() => {
                if (isApprovePanelShown) return
                refreshLiquidity()
                refreshTokenPrice()
              }}
            />
          </Row>
        </div>

        <CoinInputBox
          componentRef={coinInputBox2ComponentRef}
          disabled={isApprovePanelShown}
          value={coin2Amount}
          haveHalfButton
          haveCoinIcon
          canSelect
          topLeftLabel=""
          onTryToTokenSelect={() => {
            turnOnCoinSelector()
            setTargetCoinNo('2')
          }}
          onEnter={(input) => {
            if (!input) return
            if (!coin1) coinInputBox1ComponentRef.current?.selectToken?.()
            if (coin1 && coin1Amount) liquidityButtonComponentRef.current?.click?.()
          }}
          onUserInput={(amount) => {
            useLiquidity.setState({ coin2Amount: amount, focusSide: 'coin2' })
          }}
          token={coin2}
        />
      </>

      {/* info panel */}
      <FadeInStable show={hasFoundLiquidityPool}>
        <LiquidityCardInfo className="mt-5" />
      </FadeInStable>

      {/* confirm panel */}
      <LiquidityConfirmRiskPanel
        className="mt-5"
        isPanelOpen={needConfirmPanel}
        onTemporarilyConfirm={toggleTemporarilyConfirm}
        onPermanentlyConfirm={(checkState) => {
          currentJsonInfo && togglePermanentlyConfirm(checkState, currentJsonInfo?.id)
        }}
      />

      {/* supply button */}
      <Button
        className="block frosted-glass-teal w-full mt-5"
        componentRef={liquidityButtonComponentRef}
        validators={[
          {
            should: connected,
            forceActive: true,
            fallbackProps: {
              onClick: () => useAppSettings.setState({ isWalletSelectorShown: true }),
              children: 'Connect Wallet'
            }
          },
          {
            should: hasFoundLiquidityPool,
            fallbackProps: { children: `Pool not found` }
          },
          {
            should: coin1 && coin2,
            fallbackProps: { children: 'Select a token' }
          },
          {
            should: coin1Amount && isMeaningfulNumber(coin1Amount) && coin2Amount && isMeaningfulNumber(coin2Amount),
            fallbackProps: { children: 'Enter an amount' }
          },
          {
            should: !needConfirmPanel || hasUserTemporaryConfirmed,
            fallbackProps: { children: `Confirm liquidity guide` }
          },
          {
            should: haveEnoughCoin1,
            fallbackProps: { children: `Insufficient ${coin1?.symbol ?? ''} balance` }
          },
          {
            should: haveEnoughCoin2,
            fallbackProps: { children: `Insufficient ${coin2?.symbol ?? ''} balance` }
          },
          {
            should: isMeaningfulNumber(coin1Amount) && isMeaningfulNumber(coin2Amount),
            fallbackProps: { children: 'Enter an amount' }
          }
        ]}
        onClick={() => {
          txAddLiquidity().then(
            ({ allSuccess }) => allSuccess && needConfirmPanel && hasUserPermanentConfirmed && closePanel()
          )
        }}
      >
        Add Liquidity
      </Button>

      {/* alert user if sol is not much */}
      <RemainSOLAlert />

      {/** coin selector panel */}
      <TokenSelectorDialog
        open={isCoinSelectorOn}
        close={turnOffCoinSelector}
        onSelectCoin={(token) => {
          if (targetCoinNo === '1') {
            useLiquidity.setState({ coin1: token })
            if (String(token.mint) === String(coin2?.mint)) {
              useLiquidity.setState({ coin2: undefined })
            }
          } else {
            useLiquidity.setState({ coin2: token })
            if (String(token.mint) === String(coin1?.mint)) {
              useLiquidity.setState({ coin1: undefined })
            }
          }
          turnOffCoinSelector()
        }}
      />
      <SearchAmmDialog
        open={isSearchAmmDialogOpen}
        onClose={() => {
          useLiquidity.setState({ isSearchAmmDialogOpen: false })
        }}
      />
    </CyberpunkStyleCard>
  )
}

function RemainSOLAlert() {
  const rawsolBalance = useWallet((s) => s.solBalance)
  const solBalance = div(rawsolBalance, 10 ** SOLDecimals)

  return (
    <FadeIn>
      {solBalance && lt(solBalance, SOL_BASE_BALANCE) && gte(solBalance, 0) && (
        <Row className="text-sm mt-2 text-[#D8CB39] items-center justify-center">
          SOL balance: {toString(solBalance)}{' '}
          <Tooltip placement="bottom-right">
            <Icon size="sm" heroIconName="question-mark-circle" className="ml-2 cursor-help" />
            <Tooltip.Panel>
              <p className="w-80">
                SOL is needed for Solana network fees. A minimum balance of {SOL_BASE_BALANCE} SOL is recommended to
                avoid failed transactions. This swap will leave you with less than {SOL_BASE_BALANCE} SOL.
              </p>
            </Tooltip.Panel>
          </Tooltip>
        </Row>
      )}
    </FadeIn>
  )
}

function LiquidityCardPriceIndicator({ className }: { className?: string }) {
  const [innerReversed, setInnerReversed] = useState(false)

  const currentHydratedInfo = useLiquidity((s) => s.currentHydratedInfo)
  const coin1 = useLiquidity((s) => s.coin1)
  const coin2 = useLiquidity((s) => s.coin2)
  const isMobile = useAppSettings((s) => s.isMobile)

  const pooledBaseTokenAmount = currentHydratedInfo?.baseToken
    ? toTokenAmount(currentHydratedInfo.baseToken, currentHydratedInfo.baseReserve)
    : undefined
  const pooledQuoteTokenAmount = currentHydratedInfo?.quoteToken
    ? toTokenAmount(currentHydratedInfo.quoteToken, currentHydratedInfo.quoteReserve)
    : undefined

  const isCoin1Base = String(currentHydratedInfo?.baseMint) === String(coin1?.mint)
  const [poolCoin1TokenAmount, poolCoin2TokenAmount] = isCoin1Base
    ? [pooledBaseTokenAmount, pooledQuoteTokenAmount]
    : [pooledQuoteTokenAmount, pooledBaseTokenAmount]

  const price =
    isMeaningfulNumber(poolCoin1TokenAmount) && poolCoin2TokenAmount
      ? div(poolCoin2TokenAmount, poolCoin1TokenAmount)
      : undefined

  const innerPriceLeftCoin = innerReversed ? coin2 : coin1
  const innerPriceRightCoin = innerReversed ? coin1 : coin2

  if (!price) return null
  return (
    <Row className={twMerge('font-medium text-sm text-[#ABC4FF]', className)}>
      {1} {innerPriceLeftCoin?.symbol ?? '--'} ≈{' '}
      {toString(innerReversed ? div(1, price) : price, {
        decimalLength: isMobile ? 'auto 2' : 'auto',
        zeroDecimalNotAuto: true
      })}{' '}
      {innerPriceRightCoin?.symbol ?? '--'}
      <div className="ml-2 clickable" onClick={() => setInnerReversed((b) => !b)}>
        ⇋
      </div>
    </Row>
  )
}

function LiquidityCardInfo({ className }: { className?: string }) {
  const currentHydratedInfo = useLiquidity((s) => s.currentHydratedInfo)
  const coin1 = useLiquidity((s) => s.coin1)
  const coin2 = useLiquidity((s) => s.coin2)
  const slippageTolerance = useAppSettings((s) => s.slippageTolerance)

  const isCoin1Base = String(currentHydratedInfo?.baseMint) === String(coin1?.mint)

  const coinBase = isCoin1Base ? coin1 : coin2
  const coinQuote = isCoin1Base ? coin2 : coin1

  const pooledBaseTokenAmount = currentHydratedInfo?.baseToken
    ? toTokenAmount(currentHydratedInfo.baseToken, currentHydratedInfo.baseReserve)
    : undefined
  const pooledQuoteTokenAmount = currentHydratedInfo?.quoteToken
    ? toTokenAmount(currentHydratedInfo.quoteToken, currentHydratedInfo.quoteReserve)
    : undefined

  const isStable = useMemo(() => Boolean(currentHydratedInfo?.version === 5), [currentHydratedInfo])

  return (
    <Col
      className={twMerge(
        'py-4 px-6 flex-grow ring-inset ring-1.5 ring-[rgba(171,196,255,.5)] rounded-xl items-center',
        className
      )}
    >
      <Col className="gap-3 w-full">
        <LiquidityCardItem
          fieldName={`Pooled (base)`}
          fieldValue={
            pooledBaseTokenAmount
              ? `${formatNumber(pooledBaseTokenAmount.toExact())} ${coinBase?.symbol ?? 'unknown'}`
              : '--'
          }
        />
        <LiquidityCardItem
          fieldName={`Pooled (quote)`}
          fieldValue={
            pooledQuoteTokenAmount
              ? `${formatNumber(pooledQuoteTokenAmount.toExact())} ${coinQuote?.symbol ?? 'unknown'}`
              : '--'
          }
        />
        <LiquidityCardItem
          fieldName={`LP supply`}
          fieldValue={
            <Row className="items-center gap-2">
              {isStable && <Badge size="sm">Stable</Badge>}
              <div>
                {currentHydratedInfo?.lpToken
                  ? `${formatNumber(
                      toTokenAmount(currentHydratedInfo.lpToken, currentHydratedInfo.lpSupply).toSignificant()
                    )} LP`
                  : '--'}
              </div>
            </Row>
          }
        />
        <Collapse openDirection="upwards" className="w-full">
          <Collapse.Body>
            <Col className="gap-3 pb-3">
              <LiquidityCardItem fieldName="Addresses" tooltipContent={<LiquidityCardTooltipPanelAddress />} />
              <LiquidityCardItem
                fieldName="Slippage Tolerance"
                fieldValue={
                  <Row className="py-1 px-2 bg-[#141041] rounded-sm text-[#F1F1F2] font-medium text-xs">
                    <Input
                      className="w-6"
                      value={toString(mul(slippageTolerance, 100), { decimalLength: 'auto 2' })}
                      onUserInput={(value) => {
                        const n = div(parseFloat(value), 100)
                        if (n) {
                          useAppSettings.setState({ slippageTolerance: n })
                        }
                      }}
                    />
                    <div className="opacity-50 ml-1">%</div>
                  </Row>
                }
              />
            </Col>
          </Collapse.Body>
          <Collapse.Face>
            {(open) => (
              <Row className="w-full items-center text-xs font-medium text-[rgba(171,196,255,0.5)] cursor-pointer select-none">
                <div>{open ? 'Show less' : 'More information'}</div>
                <Icon size="xs" heroIconName={open ? 'chevron-up' : 'chevron-down'} className="ml-1" />
              </Row>
            )}
          </Collapse.Face>
        </Collapse>
      </Col>
    </Col>
  )
}
function LiquidityCardItem({
  className,
  fieldName,
  fieldValue,
  tooltipContent,
  debugForceOpen
}: {
  className?: string
  fieldName?: string
  fieldValue?: ReactNode
  tooltipContent?: ReactNode
  /** !! only use it in debug */
  debugForceOpen?: boolean
}) {
  return (
    <Row className={twMerge('w-full justify-between', className)}>
      <Row className="items-center text-xs font-medium text-[#ABC4FF]">
        <div className="mr-1">{fieldName}</div>
        {tooltipContent && (
          <Tooltip className={className} placement="bottom-right" forceOpen={debugForceOpen}>
            <Icon size="xs" heroIconName="question-mark-circle" className="cursor-help" />
            <Tooltip.Panel>{tooltipContent}</Tooltip.Panel>
          </Tooltip>
        )}
      </Row>
      <div className="text-xs font-medium text-white">{fieldValue}</div>
    </Row>
  )
}

function LiquidityCardTooltipPanelAddress() {
  const coin1 = useLiquidity((s) => s.coin1)
  const coin2 = useLiquidity((s) => s.coin2)
  const { lpMint, id } = useLiquidity((s) => s.currentJsonInfo) ?? {}
  return (
    <div className="w-56">
      <div className="text-sm font-semibold mb-2">Addresses</div>
      <Col className="gap-2">
        {coin1 && (
          <LiquidityCardTooltipPanelAddressItem
            label={coin1.symbol ?? '--'}
            type="token"
            address={String(coin1.mint ?? '--')}
          />
        )}
        {coin2 && (
          <LiquidityCardTooltipPanelAddressItem
            label={coin2.symbol ?? '--'}
            type="token"
            address={String(coin2.mint ?? '--')}
          />
        )}
        {Boolean(lpMint) && <LiquidityCardTooltipPanelAddressItem label="LP" type="token" address={lpMint!} />}
        {Boolean(id) && <LiquidityCardTooltipPanelAddressItem label="AmmID" type="ammId" address={id!} />}
      </Col>
    </div>
  )
}

function LiquidityCardTooltipPanelAddressItem({
  className,
  label,
  address,
  type = 'account'
}: {
  className?: string
  label: string
  address: string
  type?: 'token' | 'market' | 'ammId' | 'account'
}) {
  return (
    <Row className={twMerge('grid gap-1 items-center grid-cols-[4em,1fr,auto,auto]', className)}>
      <div className="text-xs font-normal text-white">{label}</div>
      <Row className="px-1 py-0.5 text-xs font-normal text-white bg-[#141041] rounded justify-center">
        {/* setting text-overflow empty string will make effect in FireFox, not Chrome */}
        <div className="self-end overflow-hidden tracking-wide">{address.slice(0, 5)}</div>
        <div className="tracking-wide">...</div>
        <div className="overflow-hidden tracking-wide">{address.slice(-5)}</div>
      </Row>
      <Icon
        size="sm"
        heroIconName="clipboard-copy"
        className="clickable text-[#ABC4FF]"
        onClick={() => {
          copyToClipboard(address)
        }}
      />
      <Link href={`https://solscan.io/${type.replace('ammId', 'account')}/${address}`}>
        <Icon size="sm" heroIconName="external-link" className="clickable text-[#ABC4FF]" />
      </Link>
    </Row>
  )
}

function UserLiquidityExhibition() {
  const hydratedInfos = useLiquidity((s) => s.hydratedInfos)
  const userExhibitionLiquidityIds = useLiquidity((s) => s.userExhibitionLiquidityIds)
  const isRemoveDialogOpen = useLiquidity((s) => s.isRemoveDialogOpen)
  const scrollToInputBox = useLiquidity((s) => s.scrollToInputBox)
  const farmPoolsList = useFarms((s) => s.jsonInfos)
  const getToken = useToken((s) => s.getToken)

  const balances = useWallet((s) => s.balances)
  const rawBalances = useWallet((s) => s.rawBalances)
  const isMobile = useAppSettings((s) => s.isMobile)

  const computeSharePercentValue = (percent: Percent | undefined) => {
    if (!percent) return '--%'
    if (percent.numerator.mul(new BN(10000)).div(percent.denominator).lt(new BN(1))) return '<0.01%'
    return percent.mul(new BN(100)).toFixed(2) + '%'
  }

  const exhibitionInfos = useMemo(
    () => hydratedInfos.filter(({ id }) => userExhibitionLiquidityIds?.includes(String(id))),
    [hydratedInfos, userExhibitionLiquidityIds]
  )
  return (
    <div className="mt-12 max-w-[456px] self-center">
      <div className="mb-6 text-xl font-medium text-white">Your Liquidity</div>
      <Card
        className="p-6 mt-6 mobile:py-5 mobile:px-3"
        size="lg"
        style={{
          background:
            'linear-gradient(140.14deg, rgba(0, 182, 191, 0.15) 0%, rgba(27, 22, 89, 0.1) 86.61%), linear-gradient(321.82deg, #18134D 0%, #1B1659 100%)'
        }}
      >
        <List className={`flex flex-col gap-6 mobile:gap-5 ${exhibitionInfos.length ? 'mb-5' : ''}`}>
          {exhibitionInfos.map((info, idx) => {
            const correspondingFarm = farmPoolsList.find(
              (farmJsonInfo) => farmJsonInfo.lpMint === toPubString(info.lpMint)
            )
            return (
              <List.Item key={idx}>
                <FadeIn>
                  <Collapse className="py-4 px-6 mobile:px-4 ring-inset ring-1.5 ring-[rgba(171,196,255,.5)] rounded-3xl mobile:rounded-xl">
                    <Collapse.Face>
                      {(open) => (
                        <Row className="items-center justify-between">
                          <Row className="gap-2 items-center">
                            <CoinAvatarPair
                              className="justify-self-center"
                              token1={info.baseToken}
                              token2={info.quoteToken}
                              size={isMobile ? 'sm' : 'md'}
                            />
                            <div className="text-base font-normal text-[#abc4ff]">
                              {info.baseToken?.symbol ?? ''}/{info.quoteToken?.symbol ?? ''}
                            </div>
                          </Row>
                          <Icon
                            size="sm"
                            className="text-[#abc4ff]"
                            heroIconName={`${open ? 'chevron-up' : 'chevron-down'}`}
                          />
                        </Row>
                      )}
                    </Collapse.Face>
                    <Collapse.Body>
                      <Col className="border-t-1.5 border-[rgba(171,196,255,.5)] mt-5 mobile:mt-4 py-5 gap-3">
                        <Row className="justify-between">
                          <div className="text-xs mobile:text-2xs font-medium text-[#abc4ff]">Pooled (Base)</div>
                          <div className="text-xs mobile:text-2xs font-medium text-white">
                            {info.userBasePooled?.toSignificant() ?? '--'} {info.baseToken?.symbol}
                          </div>
                        </Row>
                        <Row className="justify-between">
                          <div className="text-xs mobile:text-2xs font-medium text-[#abc4ff]">Pooled (Quote)</div>
                          <div className="text-xs mobile:text-2xs font-medium text-white">
                            {info.userQuotePooled?.toSignificant() ?? '--'} {info.quoteToken?.symbol}
                          </div>
                        </Row>
                        <Row className="justify-between">
                          <div className="text-xs mobile:text-2xs font-medium text-[#abc4ff]">Your Liquidity</div>
                          <div className="text-xs mobile:text-2xs font-medium text-white">
                            {info.lpMint
                              ? div(rawBalances[String(info.lpMint)], 10 ** info.lpDecimals)?.toSignificant?.(
                                  info.lpDecimals
                                )
                              : '--'}{' '}
                            LP
                          </div>
                        </Row>
                        <Row className="justify-between">
                          <div className="text-xs mobile:text-2xs font-medium text-[#abc4ff]">Your share</div>
                          <div className="text-xs mobile:text-2xs font-medium text-white">
                            {computeSharePercentValue(info.sharePercent)}
                          </div>
                        </Row>
                      </Col>
                      <Row className="gap-4 mb-1">
                        <Button
                          className="text-base mobile:text-sm font-medium frosted-glass frosted-glass-teal rounded-xl flex-grow"
                          onClick={() => {
                            useLiquidity.setState({
                              currentJsonInfo: info.jsonInfo
                            })
                            scrollToInputBox()
                          }}
                        >
                          Add Liquidity
                        </Button>
                        <Tooltip>
                          <Icon
                            size="smi"
                            iconSrc="/icons/pools-farm-entry.svg"
                            className={`grid place-items-center w-10 h-10 mobile:w-8 mobile:h-8 ring-inset ring-1 mobile:ring-1 ring-[rgba(171,196,255,.5)] rounded-xl mobile:rounded-lg text-[rgba(171,196,255,.5)] clickable-filter-effect ${
                              correspondingFarm ? 'clickable' : 'not-clickable'
                            }`}
                            onClick={() => {
                              routeTo('/farms', {
                                queryProps: {
                                  searchText: shakeFalsyItem([
                                    String(info.baseToken?.symbol ?? ''),
                                    String(info.quoteToken?.symbol ?? '')
                                  ]).join(' ')
                                }
                              })
                            }}
                          />
                          <Tooltip.Panel>Farm</Tooltip.Panel>
                        </Tooltip>
                        <Tooltip>
                          <Icon
                            iconSrc="/icons/msic-swap-h.svg"
                            size="smi"
                            className="grid place-items-center w-10 h-10 mobile:w-8 mobile:h-8 ring-inset ring-1 mobile:ring-1 ring-[rgba(171,196,255,.5)] rounded-xl mobile:rounded-lg text-[rgba(171,196,255,.5)] clickable clickable-filter-effect"
                            onClick={() => {
                              routeTo('/swap', {
                                queryProps: {
                                  coin1: info.baseToken,
                                  coin2: info.quoteToken
                                }
                              })
                            }}
                          />
                          <Tooltip.Panel>Swap</Tooltip.Panel>
                        </Tooltip>
                        <Tooltip>
                          <Icon
                            size="smi"
                            iconSrc="/icons/pools-remove-liquidity-entry.svg"
                            className={`grid place-items-center w-10 h-10 mobile:w-8 mobile:h-8 ring-inset ring-1 mobile:ring-1 ring-[rgba(171,196,255,.5)] rounded-xl mobile:rounded-lg text-[rgba(171,196,255,.5)] clickable clickable-filter-effect`}
                            onClick={() => {
                              useLiquidity.setState({ currentJsonInfo: info.jsonInfo, isRemoveDialogOpen: true })
                            }}
                          />
                          <Tooltip.Panel>Remove Liquidity</Tooltip.Panel>
                        </Tooltip>
                      </Row>
                    </Collapse.Body>
                  </Collapse>
                </FadeIn>
              </List.Item>
            )
          })}
        </List>

        <RemoveLiquidityDialog
          open={isRemoveDialogOpen}
          onClose={() => {
            useLiquidity.setState({ isRemoveDialogOpen: false })
          }}
        />
        <div className="text-xs mobile:text-2xs font-medium text-[rgba(171,196,255,0.5)]">
          If you staked your LP tokens in a farm, unstake them to see them here
        </div>
      </Card>
    </div>
  )
}

function CreatePoolCardEntry() {
  return (
    <div className="mt-12 max-w-[456px] self-center">
      <div className="mb-6 text-xl font-medium text-white">Create Pool</div>
      <Card
        className="p-6 mt-6 mobile:py-5 mobile:px-3"
        size="lg"
        style={{
          background:
            'linear-gradient(140.14deg, rgba(0, 182, 191, 0.15) 0%, rgba(27, 22, 89, 0.1) 86.61%), linear-gradient(321.82deg, #18134D 0%, #1B1659 100%)'
        }}
      >
        <Row className="gap-4">
          <div className="text-xs mobile:text-2xs font-medium text-[rgba(171,196,255,0.5)]">
            Create a liquidity pool on Raydium that can be traded on the the swap interface.{' '}
            <Link
              noTextStyle
              className="text-[rgba(171,196,255)] hover:underline"
              href="https://raydium.gitbook.io/raydium/permissionless/creating-a-pool"
            >
              Read the guide
            </Link>{' '}
            before attempting.
          </div>

          <Button
            className="flex items-center frosted-glass-teal opacity-80"
            onClick={() => {
              routeTo('/liquidity/create')
            }}
          >
            <Icon className="mr-2" heroIconName="plus" />
            Create Pool
          </Button>
        </Row>
      </Card>
    </div>
  )
}
