import {
  del,
  displayError,
  FilteredPaginator,
  Output,
  patch,
  post,
  put,
  get,
} from "/static/core/js/modules/form.js";
import {
  embedVideo,
  generatePlayer,
} from "/static/demonlist/js/modules/demonlist.js";
import { Paginator } from "/static/core/js/modules/form.js";
import { generateRecord } from "/static/demonlist/js/modules/demonlist.js";
import { loadResource, tr, trp } from "/static/core/js/modules/localization.js";

export let claimManager;

class ClaimManager extends FilteredPaginator {
  constructor() {
    super(
      "claim-pagination",
      (claim) => generateClaim(claim),
      "any_name_contains"
    );
  }

  onSelect(selected) {
    get(
      "/api/v1/records/?limit=1&status=APPROVED&player=" +
        selected.dataset.playerId,
      {}
    ).then((response) => {
      if (response.data.length === 0) {
        this.setError(
          trp("demonlist", "player", "claim-manager.claim-no-records", {
            ["player-id"]: selected.dataset.playerId,
          })
        );
        document.getElementById("claim-video").removeAttribute("src");
      } else {
        document.getElementById("claim-video").src = embedVideo(
          response.data[0].video
        );
        this.setError(null);
      }
    });
  }
}

// Clearly visible colours for the two end states of a claim. The default `.ok` / `.err` classes are
// only faintly tinted, which is easy to miss on a white page.
const CLAIM_STATE_STYLES = {
  verified: {
    className: "ok",
    background: "#b7f0a6",
    borderLeft: "6px solid #2f9e1f",
    color: "#0b3d06",
    label: "claim-listed-verified",
    icon: "\u2714 ",
  },
  deleted: {
    className: "err",
    background: "#ffb8b8",
    borderLeft: "6px solid #d11a2a",
    color: "#520509",
    label: "claim-listed-deleted",
    icon: "\u2716 ",
  },
};

function applyClaimState(li, state) {
  const style = CLAIM_STATE_STYLES[state];

  li.classList.remove("consider");
  li.classList.add(style.className);
  li.style.background = style.background;
  li.style.borderLeft = style.borderLeft;
  li.style.color = style.color;
}

function makeStatusLabel(state) {
  const style = CLAIM_STATE_STYLES[state];

  const label = document.createElement("b");
  label.style.alignSelf = "center";
  label.style.marginRight = "10px";
  label.innerText = style.icon + tr("demonlist", "player", style.label);

  return label;
}

function clearChildren(element) {
  while (element.lastChild) {
    element.removeChild(element.lastChild);
  }
}

function generateClaim(claim) {
  let li = document.createElement("li");

  li.classList.add("flex", "no-stretch");
  li.style.justifyContent = "space-between";

  let leftDiv = document.createElement("div");
  let userSpan = document.createElement("span");
  let playerSpan = document.createElement("span");

  let uname = document.createElement("b");
  uname.innerText = tr("demonlist", "player", "claim-listed-user") + " ";

  userSpan.appendChild(uname);
  userSpan.appendChild(
    document.createTextNode(claim.user.name + " (" + claim.user.id + ")")
  );

  let pname = document.createElement("b");
  pname.innerText = tr("demonlist", "player", "claim-listed-player") + " ";

  playerSpan.appendChild(pname);
  playerSpan.appendChild(
    document.createTextNode(claim.player.name + " (" + claim.player.id + ")")
  );

  leftDiv.appendChild(userSpan);
  leftDiv.appendChild(document.createElement("br"));
  leftDiv.appendChild(playerSpan);

  li.appendChild(leftDiv);

  let rightDiv = document.createElement("div");

  rightDiv.classList.add("flex");

  const claimUrl =
    "/api/v1/players/" + claim.player.id + "/claims/" + claim.user.id + "/";

  if (claim.verified) {
    applyClaimState(li, "verified");
    rightDiv.appendChild(makeStatusLabel("verified"));
  } else {
    li.classList.add("consider");
    let button = makeButton("check");
    button.style.marginRight = "5px";

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      patch(claimUrl, {}, { verified: true })
        .then(() => {
          // Turn the row green right away, then reload the list from the server (verifying a claim
          // also removes all other claims on the same player, so the list can change).
          applyClaimState(li, "verified");
          clearChildren(rightDiv);
          rightDiv.appendChild(makeStatusLabel("verified"));
          rightDiv.appendChild(makeDeleteButton());

          return claimManager.refresh();
        })
        .catch(displayError(claimManager));
    });

    rightDiv.appendChild(button);
  }

  function makeDeleteButton() {
    let deleteButton = makeButton("trash-alt");

    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      del(claimUrl, {})
        .then(() => {
          // Show the row in red for a moment so it is obvious what happened, then drop it from the list.
          applyClaimState(li, "deleted");
          li.style.pointerEvents = "none";
          clearChildren(rightDiv);
          rightDiv.appendChild(makeStatusLabel("deleted"));

          setTimeout(() => claimManager.refresh(), 1500);
        })
        .catch(displayError(claimManager));
    });

    return deleteButton;
  }

  rightDiv.appendChild(makeDeleteButton());
  li.appendChild(rightDiv);

  li.dataset.playerId = claim.player.id;

  return li;
}

function makeButton(faClass) {
  let a = document.createElement("a");
  a.classList.add("button", "blue", "hover");

  let i = document.createElement("i");
  i.classList.add("fas", "fa-" + faClass);

  a.appendChild(i);

  return a;
}

class ClaimPlayerPaginator extends FilteredPaginator {
  constructor() {
    super("claims-initiate-claim-pagination", generatePlayer, "name_contains");
  }

  onSelect(selected) {
    // No need to actually retrieve the player object!
    this.onReceive({
      status: 200,
      data: {
        data: {
          id: selected.dataset.id,
          name: selected.dataset.name,
        },
      },
      headers: {},
    });
  }
}

class ClaimedPlayerRecordPaginator extends Paginator {
  constructor(playerId) {
    super("claims-record-pagination", { player: playerId }, generateRecord);
  }

  onSelect(selected) {
    let recordId = selected.dataset.id;

    get("/api/v1/records/" + recordId + "/notes/")
      .then((response) => {
        if (Array.isArray(response.data) && response.data.length > 0) {
          this.setSuccess(null);

          while (this.successOutput.lastChild) {
            this.successOutput.removeChild(this.successOutput.lastChild);
          }

          let title = document.createElement("b");
          title.innerText = trp(
            "demonlist",
            "player",
            "claim-records.record-notes",
            {
              ["record-id"]: recordId,
            }
          );

          this.successOutput.appendChild(title);
          this.successOutput.appendChild(document.createElement("br"));

          for (let note of response.data) {
            let noteAuthor = document.createElement("i");
            noteAuthor.innerText = "(" + note.author + ") ";

            this.successOutput.appendChild(noteAuthor);
            this.successOutput.appendChild(
              document.createTextNode(note.content)
            );
          }

          this.successOutput.style.display = "block";
        } else {
          this.setSuccess(
            tr("demonlist", "player", "claim-records.record-notes-none")
          );
        }
      })
      .catch(displayError(this));
  }
}

export function initialize() {
  if (document.getElementById("claim-pagination")) {
    claimManager = new ClaimManager();
    claimManager.initialize();
  }

  let claimedPlayer = document.getElementById("claimed-player");

  let playerPaginator = new ClaimPlayerPaginator();
  playerPaginator.initialize();
  playerPaginator.addSelectionListener((selected) => {
    put("/api/v1/players/" + selected.id + "/claims/")
      .then(() => {
        window.location.reload();
      })
      .catch(displayError(playerPaginator));
  });

  document.getElementById("player-claim-pen").addEventListener("click", () => {
    playerPaginator.html.parentElement.style.display = "block";
  });

  let claimPanel = document.getElementById("claims-claim-panel");

  if (claimPanel) {
    let geolocationButton = document.getElementById(
      "claims-geolocate-nationality"
    );
    let output = new Output(claimPanel);

    let playerId = claimedPlayer.dataset.id;

    if (geolocationButton) {
      geolocationButton.addEventListener("click", () => {
        post("/api/v1/players/me/geolocate/")
          .then((response) => {
            let nationality = response.data;
            if (nationality.subdivision) {
              output.setSuccess(
                trp(
                  "demonlist",
                  "player",
                  "claim-geolocate.edit-success-subdivision",
                  {
                    ["nationality"]: nationality.nation,
                    ["subdivision"]: nationality.subdivision.name,
                  }
                )
              );
            } else {
              output.setSuccess(
                trp("demonlist", "player", "claim-geolocate.edit-success", {
                  ["nationality"]: nationality.nation,
                })
              );
            }
          })
          .catch(displayError(output));
      });
    }

    let lockSubmissionsCheckbox = document.getElementById(
      "lock-submissions-checkbox"
    );
    lockSubmissionsCheckbox.addEventListener("change", () => {
      patch(
        "/api/v1/players/" + playerId + "/claims/" + window.userId + "/",
        {},
        { lock_submissions: lockSubmissionsCheckbox.checked }
      )
        .then((_) => {
          output.setSuccess(
            tr("demonlist", "player", "claim-lock-submissions.edit-success")
          );
        })
        .catch(displayError(output));
    });

    let recordPaginator = new ClaimedPlayerRecordPaginator(playerId);
    recordPaginator.initialize();
  }
}
