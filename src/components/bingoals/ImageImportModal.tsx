import { useEffect, useState } from 'react'
import { ImagePlus, Link2 } from 'lucide-react'
import { useTranslation } from '../../lib/i18n'
import { fileToCompressedDataUrl, remoteImageToCompressedDataUrl } from '../../lib/bingoals/image'
import BingoModal from './BingoModal'

type Props = {
  open: boolean
  onClose: () => void
  onAdd: (dataUrls: string[]) => Promise<void> | void
  multiple?: boolean
  maxSide?: number
  quality?: number
}

export default function ImageImportModal({ open, onClose, onAdd, multiple = true, maxSide, quality }: Props) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setUrl('')
    setError('')
    setBusy(false)
  }, [open])

  const finish = async (dataUrls: string[]) => {
    await onAdd(dataUrls)
    onClose()
  }

  const importUrl = async () => {
    if (!url.trim() || busy) return
    setBusy(true)
    setError('')
    try {
      const data = await remoteImageToCompressedDataUrl(url, { maxSide, quality })
      await finish([data])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('bingoals.image_import_error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <BingoModal open={open} title={t('bingoals.image_import_title')} onClose={onClose}>
      <div className="form bingo-image-import">
        <div className="bingo-image-import-section">
          <span className="bingo-image-import-label"><Link2 size={15} /> {t('bingoals.image_from_web')}</span>
          <div className="row bingo-image-url-row">
            <input
              type="url"
              value={url}
              autoFocus
              placeholder="https://…/image.jpg"
              onChange={(event) => { setUrl(event.target.value); setError('') }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && url.trim() && !busy) {
                  event.preventDefault()
                  void importUrl()
                }
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              data-import-url
              disabled={busy || !url.trim()}
              onClick={() => void importUrl()}
            >{busy ? t('bingoals.image_importing') : t('bingoals.image_import')}</button>
          </div>
          <small>{t('bingoals.image_web_hint')}</small>
        </div>

        <div className="bingo-image-import-divider"><span>{t('bingoals.or')}</span></div>

        <label className="btn bingo-image-local-button">
          <ImagePlus size={17} /> {t('bingoals.choose_image')}
          <input
            type="file"
            accept="image/*"
            multiple={multiple}
            className="bingo-file-input"
            onChange={async (event) => {
              const files = Array.from(event.target.files ?? [])
              if (files.length === 0) return
              setBusy(true)
              setError('')
              try {
                const selected = multiple ? files : files.slice(0, 1)
                const data = await Promise.all(selected.map(file => fileToCompressedDataUrl(file, { maxSide, quality })))
                await finish(data)
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : t('bingoals.image_import_error'))
              } finally {
                event.currentTarget.value = ''
                setBusy(false)
              }
            }}
          />
        </label>
        {error && <div className="bingo-image-import-error" role="alert">{error}</div>}
      </div>
    </BingoModal>
  )
}
