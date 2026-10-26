# Delivery status

The application is implemented and runs locally at http://127.0.0.1:8000 while the preview server is active.

- Public repository: https://github.com/satyam-kapri2/r-5f01eb504d
- Vercel: https://zippy-monsoon-cgkojm2.tmp.now was reported READY by the CLI, but both browser and independent HTTP checks return an edge HTTP 403. It is not a verified working public app. The anonymous preview expires after 60 minutes unless claimed; account-owned deployment remains outstanding.
- Docker: image build and running-container smoke tests passed on Ubuntu in [GitHub Actions](https://github.com/satyam-kapri2/r-5f01eb504d/actions/runs/40379455188). The local Docker Desktop engine is unavailable.
- Demo: local `output/ventus-demo.mp4` is complete, with synthetic Microsoft David narration and eight real browser captures. Duration is 5:29 overall: client part 2:31, technical part 2:58. Captions are in `output/ventus-demo.srt`; chapter timings are in `output/demo-manifest.json`. No unlisted YouTube publication is claimed.
- Submission form: not submitted; the required public deployment and YouTube link must be valid first.

Private deployment credentials and claim URLs are kept outside tracked source. The original assignment PDF, raw-response cache, generated video, environment directories, and temporary build outputs are excluded from the repository.

## Final browser checks

- Desktop charts, cutoff changes, accuracy cohort, January 31 / February 1 boundary, methodology, and provenance were inspected in the browser.
- Mobile layout was checked at 390px width, with no document overflow; drawer navigation and interval table were exercised.
- CSV export was downloaded and independently parsed: 24 rows, correct fields, and every forecast publication at or before the exported cutoff.
- Local narration tracks contain nonzero audio; the video and each part satisfy the brief's duration limits.

## Remaining external steps

1. Deploy to an account-owned Vercel or Heroku project and verify public access. The temporary deployment's HTTP 403 prevents claiming successful hosted delivery.
2. Upload the local video as unlisted on YouTube using an authenticated account.
3. Verify the final repository, hosted app, and video URLs in an incognito session before submitting the form.

No public deployment or video upload is represented as complete without a successful verification result.
