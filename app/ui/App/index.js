var React = require("react");
var _ = require("lodash");
var raf = require("raf");

var PromiseMixin = require("../../mixins/PromiseMixin");
var Diaporama = require("../../models/Diaporama");
var MainPanel = require("../MainPanel");
var Viewer = require("../Viewer");
var Timeline = require("../Timeline");
var Bootstrap = require("../Bootstrap");

function getWidth () {
  return Math.max(800, window.innerWidth);
}
function getHeight () {
  return Math.max(500, window.innerHeight);
}

var App = React.createClass({

  mixins: [ PromiseMixin ],

  getInitialState: function () {
    return {
      width: getWidth(),
      height: getHeight(),
      diaporama: undefined, // undefined means not loaded yet, null means no diaporama init yet
      diaporamaLocalized: null,
      panel: "library",
      hoverTimeline: false,
      windowFocus: true,
      selectedItem: null,
      time: 0
    };
  },

  componentDidMount: function () {
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("focus", this.onFocus);
    window.addEventListener("resize", this.onResize);
    document.body.addEventListener("keydown", this.onKeyDown);
    document.body.addEventListener("keyup", this.onKeyUp);
    this.sync(Diaporama.fetch()).done();
    this.startMainLoop();
  },

  componentWillUnmount: function () {
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("focus", this.onFocus);
    window.removeEventListener("resize", this.onResize);
    document.body.removeEventListener("keydown", this.onKeyDown);
    document.body.removeEventListener("keyup", this.onKeyUp);
    this.stopMainLoop();
  },

  onKeyDown: function (e) {
    console.log("down", e.which);
    switch (e.which) {
      case 13: // ENTER
        break;
      case 46: // DELETE
      case 8: // BACKSPACE
        e.preventDefault();
        this.onSelectionRemove();
        break;
      case 37: // LEFT
        e.preventDefault();
        this.onSelectionLeft();
        break;
      case 39: // RIGHT
        e.preventDefault();
        this.onSelectionRight();
        break;
    }
  },

  onKeyUp: function (e) {
    console.log("up", e.which);
  },

  onFocus: function () {
    if (!this.state.windowFocus)
      this.setState({ windowFocus: true });
  },
  onBlur: function () {
    if (this.state.windowFocus)
      this.setState({ windowFocus: false });
  },

  onResize: function () {
    this.resize(getWidth(), getHeight());
  },

  sync: function (diaporamaPromise) {
    var self = this;
    return diaporamaPromise.then(function (diaporama) {
      self.setState({
        diaporama: diaporama,
        diaporamaLocalized: Diaporama.localize(diaporama)
      });
      return diaporama;
    }, function skipErrors(){});
  },

  resize: function (W, H) {
    this.setState({
      width: W,
      height: H
    });
  },

  bootstrap: function (options) {
    this.sync(Diaporama.bootstrap(options))
      .then(this.saveDiaporama.bind(this));
  },

  saveDiaporama: function (newDiaporama) {
    if (!newDiaporama) return;
    this.setState({
      diaporama: newDiaporama,
      diaporamaLocalized: Diaporama.localize(newDiaporama)
    });
    // TODO debounce it a bit
    // TODO better feedback on failure cases
    Diaporama.save(newDiaporama).done();
  },

  addToTimeline: function (file) {
    this.saveDiaporama( Diaporama.timelineAdd(this.state.diaporama, file) );
  },

  onSelectionLeft: function () {
    var selectedItem = this.state.selectedItem;
    if (selectedItem) {
      var index = Diaporama.timelineIndexOfId(this.state.diaporama, selectedItem.id) - 1;
      var item = this.state.diaporama.timeline[index];
      if (!item) {
        this.onTimelineSelect(null);
      }
      else {
        this.onTimelineSelect(_.defaults({ id: item.id }, selectedItem||{}));
      }
    }
  },

  onSelectionRight: function () {
    var selectedItem = this.state.selectedItem;
    var index = !selectedItem ? 0 : Diaporama.timelineIndexOfId(this.state.diaporama, selectedItem.id) + 1;
    var item = this.state.diaporama.timeline[index];
    if (!item) {
      this.onTimelineSelect(null);
    }
    else {
      this.onTimelineSelect(_.defaults({ id: item.id }, selectedItem||{}));
    }
  },

  onSelectionMoveLeft: function () {
    var selectedItem = this.state.selectedItem;
    if (selectedItem) {
      if (!selectedItem.transition) {
        this.onTimelineAction("moveLeft", selectedItem.id);
      }
    }
  },
  onSelectionMoveRight: function () {
    var selectedItem = this.state.selectedItem;
    if (selectedItem) {
      if (!selectedItem.transition) {
        this.onTimelineAction("moveRight", selectedItem.id);
      }
    }
  },

  onSelectionRemove: function () {
    var selectedItem = this.state.selectedItem;
    if (selectedItem) {
      if (selectedItem.transition)
        this.onRemoveTransition(selectedItem.id);
      else
        this.onTimelineAction("remove", selectedItem.id); // FIXME action should either be remove or replace by flux like actions
      this.onTimelineSelect(null);
    }
  },

  onTimelineHoverEnter: function () {
    this.setState({
      hoverTimeline: true
    });
  },

  onTimelineHoverLeave: function () {
    this.setState({
      hoverTimeline: false
    });
  },

  onTimelineAction: function (action, id) {
    this.saveDiaporama( Diaporama.timelineAction(this.state.diaporama, action, id) );
  },

  onNav: function (panel) {
    this.setState({
      panel: panel
    });
  },

  onAddTransition: function (id) {
    this.saveDiaporama( Diaporama.bootstrapTransition(this.state.diaporama, id) );
    this.setState({
      panel: "editTransition",
      selectedItem: { id: id, transition: true }
    });
  },

  onRemoveTransition: function (id) {
    this.saveDiaporama( Diaporama.removeTransition(this.state.diaporama, id) );
  },

  onTimelineSelect: function (selection) {
    this.setState({
      panel: selection ?
        (selection.transition ? "editTransition" : "editImage") :
        (this.state.panel === "editTransition" || this.state.panel === "editImage" ? null : this.state.panel),
      selectedItem: selection
    });
  },

  onTimelineHover: function (time) {
    if (this.state.time !== time) {
      this.setState({
        time: time
      });
    }
  },

  stopMainLoop: function () {
    this._stop = true;
  },

  startMainLoop: function () {
    var self = this;
    var last;
    var p = 0;
    (function loop (t) {
      if (self._stop) return;
      raf(loop);
      if (!last) last = t;
      var dt = t - last;
      last = t;
      var panel = self.state.panel;
      var selectedItem = self.state.selectedItem;
      var diaporama = self.state.diaporama;
      var hoverTimeline = self.state.hoverTimeline;
      if (hoverTimeline) return;
      if (!self.state.windowFocus) return;
      if (panel === "editTransition") {
        var interval = Diaporama.timelineTimeIntervalForTransitionId(diaporama, selectedItem.id);
        if (interval) {
          var duration = interval.end - interval.start;
          p = (p + dt / duration) % 1;
          var t = interval.start + duration * p;
          self.setState({
            time: t
          });
        }
      }
      else if (panel === "editImage") {
        var interval = Diaporama.timelineTimeIntervalForId(diaporama, selectedItem.id);
        if (interval) {
          var duration = interval.end - interval.start;
          p = ((duration * p + dt) / duration) % 1;
          var t = interval.start + duration * p;
          self.setState({
            time: t
          });
        }
      }
    }());
  },

  onSelectedImageEdit: function (element) {
    var id = this.state.selectedItem.id;
    this.saveDiaporama(
      Diaporama.setTimelineElement(this.state.diaporama, id, element)
    );
  },

  onSelectedTransitionEdit: function (transitionNext) {
    var id = this.state.selectedItem.id;
    this.saveDiaporama(
      Diaporama.setTransition(this.state.diaporama, id, transitionNext)
    );
  },

  render: function () {
    var W = this.state.width;
    var H = this.state.height;
    var diaporama = this.state.diaporama;
    var diaporamaLocalized = this.state.diaporamaLocalized;
    var panel = this.state.panel;
    var selectedItem = this.state.selectedItem;
    var time = this.state.time;
    var hoverTimeline = this.state.hoverTimeline;

    if (diaporama === undefined) return <div>Loading...</div>;

    if (diaporama === null) return <Bootstrap onSubmit={this.bootstrap} />;

    // Bounds
    var viewerW, viewerH;
    if (H * 2 / 3 < W / 2) {
      viewerH = Math.round(H / 2);
      viewerW = Math.round(viewerH * 4 / 3);
    }
    else {
      viewerW = Math.round(W / 2);
      viewerH = Math.round(viewerW * 3 / 4);
    }
    var viewerBound = {
      x: W-viewerW,
      y: 0,
      width: viewerW,
      height: viewerH
    };
    var mainPanelBound = {
      x: 0,
      y: 0,
      width: W-viewerW,
      height: viewerH
    };
    var timelineBound = {
      x: 0,
      y: viewerH,
      width: W,
      height: H-viewerH
    };

    return <div>

      <MainPanel
        bound={mainPanelBound}
        panel={panel}
        selectedItem={selectedItem}
        diaporama={diaporama}
        onAddToTimeline={this.addToTimeline}
        onNav={this.onNav}
        onSelectedImageEdit={this.onSelectedImageEdit}
        onSelectedTransitionEdit={this.onSelectedTransitionEdit}
      />

      <Viewer
        time={time}
        bound={viewerBound}
        diaporama={diaporamaLocalized} />

      <Timeline
        time={time}
        onHoverEnter={this.onTimelineHoverEnter}
        onHoverLeave={this.onTimelineHoverLeave}
        onHoverMove={this.onTimelineHover}
        hover={hoverTimeline}
        bound={timelineBound}
        diaporama={diaporama}
        selectedItem={selectedItem}
        onSelect={this.onTimelineSelect}
        onSelectionRemove={this.onSelectionRemove}
        onSelectionMoveLeft={this.onSelectionMoveLeft}
        onSelectionMoveRight={this.onSelectionMoveRight}
        onAddTransition={this.onAddTransition}
      />

    </div>;
  }
});

module.exports = App;
