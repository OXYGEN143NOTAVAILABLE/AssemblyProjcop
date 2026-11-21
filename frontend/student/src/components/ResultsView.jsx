import React from 'react';
import { formatDateTime } from '../api.js';

export function ResultsView({ activities, onOpenActivity }) {
  const awaiting = activities.filter((a) => a.status === 'submitted');
  const released = activities.filter((a) => a.status === 'released' && a.releasedResult);

  return (
    <section className="view-section" aria-labelledby="resultsHeading">
      <header className="page-intro">
        <p className="section-kicker">Instructor-reviewed evaluations</p>
        <h1 id="resultsHeading">Results &amp; feedback</h1>
        <p className="intro-copy">
          Official compatibility verdicts, confirmed requirement scores, and instructor comments appear here once released.
        </p>
      </header>

      <div className="two-col-grid results-grid">
        <section className="panel" aria-labelledby="awaitingReviewHeading">
          <div className="panel-head">
            <div>
              <h2 id="awaitingReviewHeading">Awaiting instructor review</h2>
              <p className="panel-sub">Results are withheld until your instructor confirms and releases them.</p>
            </div>
            <span className="head-attribution mono-num">{awaiting.length}</span>
          </div>

          <div className="panel-body-flush">
            {awaiting.length ? (
              <div className="result-items">
                {awaiting.map((activity) => (
                  <article key={activity.id} className="result-item">
                    <div className="result-item-head">
                      <div>
                        <h3>{activity.title}</h3>
                        <p className="meta-line">
                          <span>{activity.className}</span>
                          {activity.submittedAt && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Submitted {formatDateTime(activity.submittedAt)}</span>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="state-text state-amber">Awaiting review</span>
                    </div>
                    <p className="muted-copy">
                      Submission recorded ({activity.attemptsUsed} of {activity.attemptsAllowed} attempt used). Your evaluation verdict and score will appear here after your instructor releases them.
                    </p>
                    <button
                      type="button"
                      className="link-action"
                      onClick={() => onOpenActivity(activity.id)}
                    >
                      Review activity details
                    </button>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <strong>Nothing awaiting review</strong>
                <p>Submitted builds waiting for instructor confirmation will appear here.</p>
              </div>
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="releasedResultsHeading">
          <div className="panel-head">
            <div>
              <h2 id="releasedResultsHeading">Released evaluations</h2>
              <p className="panel-sub">Confirmed official grades and instructor annotations (read-only).</p>
            </div>
            <span className="head-attribution mono-num">{released.length}</span>
          </div>

          <div className="panel-body-flush">
            {released.length ? (
              <div className="result-items">
                {released.map((activity) => {
                  const res = activity.releasedResult;
                  const isCompatible = String(res.compatibilityVerdict || '').toLowerCase() === 'compatible';
                  return (
                    <article key={activity.id} className="result-item">
                      <div className="result-item-head">
                        <div>
                          <h3>{activity.title}</h3>
                          <p className="meta-line">
                            <span>{activity.className}</span>
                            {activity.submittedAt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>Submitted {formatDateTime(activity.submittedAt)}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <div className="score-block">
                          <span className="score-label">Confirmed score</span>
                          <strong className="score-big mono-num">{res.activityScore}%</strong>
                        </div>
                      </div>

                      <div className="verdict-line">
                        <span>Compatibility verdict:</span>
                        <strong className={isCompatible ? 'state-text state-emerald' : 'state-text state-amber'}>
                          {res.compatibilityVerdict}
                        </strong>
                      </div>

                      {Array.isArray(res.issues) && res.issues.length > 0 && (
                        <div className="released-subblock">
                          <h4>Compatibility notes</h4>
                          <ul className="req-list">
                            {res.issues.map((issue, idx) => (
                              <li key={idx}>{issue}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="released-subblock">
                        <h4>Instructor feedback</h4>
                        <p className="muted-copy">
                          {res.feedback || 'No additional comments provided.'}
                        </p>
                      </div>

                      <div className="result-item-foot">
                        <span className="meta-line">
                          <span>Released by {res.instructorName}</span>
                          {res.releasedAt && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{formatDateTime(res.releasedAt)}</span>
                            </>
                          )}
                        </span>
                        <button
                          type="button"
                          className="link-action"
                          onClick={() => onOpenActivity(activity.id)}
                        >
                          Activity details
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <strong>No results released yet</strong>
                <p>Released evaluations and instructor feedback will appear here once published.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
