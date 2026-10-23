// Help content of each diagram family: syntax reminders with insertable
// snippets. `header` is the first line of a diagram of that family; it gives
// the highlighter its context and is used by the snippet validation test.
'use strict';

(function () {
  const HELP = {
    class: {
      title: 'Class diagram',
      header: 'classDiagram',
      intro: 'Classes with their members, and the relations between them.',
      sections: [
        {
          title: 'Classes',
          items: [
            {
              code: 'class Order {\n    +int id\n    -List~Item~ items\n    #total() float\n    +create(int id)$ Order\n}',
              text: 'Members: visibility <code>+</code> public, <code>-</code> private, <code>#</code> protected, <code>~</code> package. A method ends with <code>()</code>, its return type follows. Suffix <code>$</code> = static, <code>*</code> = abstract.',
            },
            { code: 'Order : +Date created', text: 'Adds one member from outside the class body.' },
            { code: 'class Box~T~', text: 'Generic class.' },
            { code: 'class Order["Customer order"]', text: 'Displays a label instead of the identifier.' },
          ],
        },
        {
          title: 'Item types',
          items: [
            { code: 'class Shape {\n    <<interface>>\n    +area() double\n}', text: 'Interface.' },
            { code: 'class Vehicle {\n    <<abstract>>\n    +move()* void\n}', text: 'Abstract class.' },
            { code: 'class Color {\n    <<enumeration>>\n    RED\n    GREEN\n}', text: 'Enumeration: one value per line.' },
            { code: 'class Shape\n<<interface>> Shape', text: 'Sets the stereotype of an existing class from outside its body.' },
          ],
        },
        {
          title: 'Relations',
          items: [
            { code: 'Animal <|-- Dog', text: 'Inheritance: Dog extends Animal.' },
            { code: 'Shape <|.. Circle', text: 'Realization: Circle implements Shape.' },
            { code: 'Car *-- Engine', text: 'Composition: the engine is part of the car.' },
            { code: 'Library o-- Book', text: 'Aggregation.' },
            { code: 'Order --> Customer', text: 'Directed association.' },
            { code: 'Order ..> Invoice', text: 'Dependency.' },
            { code: 'Student -- Course', text: 'Association (solid link). <code>..</code> draws a dashed link.' },
            { code: 'Customer "1" --> "*" Order : places', text: 'Multiplicities in quotes, label after <code>:</code>.' },
          ],
        },
        {
          title: 'Notes and layout',
          items: [
            { code: 'note "General remark"', text: 'Free note.' },
            { code: 'class Order\nnote for Order "Created at checkout"', text: 'Note attached to a class.' },
            { code: 'namespace Shop {\n    class Cart\n    class Product\n}', text: 'Groups classes in a namespace.' },
            { code: 'direction LR', text: 'Layout direction: <code>TB</code>, <code>BT</code>, <code>LR</code> or <code>RL</code>.' },
          ],
        },
      ],
    },

    sequence: {
      title: 'Sequence diagram',
      header: 'sequenceDiagram',
      intro: 'Messages exchanged between participants over time, from top to bottom.',
      sections: [
        {
          title: 'Participants',
          items: [
            { code: 'participant Server', text: 'Participant drawn as a box. Participants appear in order of first use.' },
            { code: 'actor User', text: 'Actor drawn as a stick figure.' },
            { code: 'participant DB as Database', text: 'Short identifier with a display label.' },
            { code: 'box Backend\n    participant API\n    participant DB\nend', text: 'Groups participants in a box.' },
          ],
        },
        {
          title: 'Messages',
          items: [
            { code: 'A->>B: Synchronous call', text: 'Solid line, filled arrowhead.' },
            { code: 'B-->>A: Reply', text: 'Dotted line: return message.' },
            { code: 'A-)B: Asynchronous message', text: 'Open arrowhead.' },
            { code: 'A-xB: Lost message', text: 'Ends with a cross.' },
            { code: 'A->B: No arrowhead', text: '<code>--></code> for the dotted version.' },
            { code: 'A->>A: Self call', text: 'Message to itself.' },
          ],
        },
        {
          title: 'Activations',
          items: [
            { code: 'A->>B: Request\nactivate B\nB-->>A: Response\ndeactivate B', text: 'Activation bar on B between the two messages.' },
            { code: 'A->>+B: Request\nB-->>-A: Response', text: 'Shorthand: <code>+</code> activates, <code>-</code> deactivates the target.' },
          ],
        },
        {
          title: 'Notes',
          items: [
            { code: 'Note right of A: Text', text: '<code>left of</code>, <code>right of</code> or <code>over</code>.' },
            { code: 'Note over A,B: Spans two participants', text: 'Note across several participants.' },
          ],
        },
        {
          title: 'Blocks',
          items: [
            { code: 'loop Every minute\n    A->>B: Ping\nend', text: 'Repetition.' },
            { code: 'alt Success\n    B-->>A: 200 OK\nelse Failure\n    B-->>A: 500 Error\nend', text: 'Alternatives. Add as many <code>else</code> as needed.' },
            { code: 'opt Logged in\n    A->>B: Load profile\nend', text: 'Optional part.' },
            { code: 'par Notify\n    A->>B: Email\nand\n    A->>C: SMS\nend', text: 'Parallel messages.' },
            { code: 'critical Open connection\n    A->>DB: Connect\noption Timeout\n    A->>A: Retry\nend', text: 'Critical region with its fallback options.' },
            { code: 'break Cancelled\n    A-->>B: Abort\nend', text: 'Stops the sequence when the condition holds.' },
          ],
        },
        {
          title: 'Other',
          items: [
            { code: 'autonumber', text: 'Numbers every message.' },
            { code: 'title Login flow', text: 'Diagram title.' },
          ],
        },
      ],
    },

    usecase: {
      title: 'Use case diagram',
      header: 'usecase-beta',
      intro: 'What actors can do with a system. This Mermaid diagram type is still in beta: its syntax may change in future Mermaid versions.',
      sections: [
        {
          title: 'Actors and use cases',
          items: [
            { code: 'actor Customer', text: 'Actor.' },
            { code: 'actor Clerk, Manager', text: 'Several actors on one line.' },
            { code: 'Checkout(Check out)', text: 'Use case: identifier and label in parentheses.' },
            { code: '"Track order"', text: 'Use case named by its label only.' },
          ],
        },
        {
          title: 'System boundary',
          items: [
            { code: 'systemBoundary Shop["Online shop"]\n    Browse(Browse catalog)\n    Pay(Pay online)\nend', text: 'Frames the use cases of a system.' },
          ],
        },
        {
          title: 'Relations',
          items: [
            { code: 'Customer --> Checkout', text: 'Association with an arrow.' },
            { code: 'Customer -- Checkout', text: 'Association without arrow.' },
            { code: 'Checkout ..>:include Pay', text: 'Include: Checkout always uses Pay.' },
            { code: 'Coupon ..>:extend Checkout', text: 'Extend: Coupon optionally extends Checkout.' },
            { code: 'actor Clerk\nactor Manager\nManager --|> Clerk', text: 'Generalization, between two actors or two use cases.' },
          ],
        },
        {
          title: 'Notes and layout',
          items: [
            { code: 'Checkout(Check out)\nnote for Checkout "Requires an account"', text: 'Note attached to an actor or a use case.' },
            { code: 'direction LR', text: 'Layout direction: <code>TB</code>, <code>BT</code>, <code>LR</code> or <code>RL</code>.' },
          ],
        },
      ],
    },

    state: {
      title: 'State diagram',
      header: 'stateDiagram-v2',
      intro: 'The states of an object and the transitions between them.',
      sections: [
        {
          title: 'States and transitions',
          items: [
            { code: '[*] --> Idle', text: 'Initial state.' },
            { code: 'Done --> [*]', text: 'Final state.' },
            { code: 'Idle --> Running : start', text: 'Transition with its event after <code>:</code>.' },
            { code: 'state "Waiting for payment" as Waiting', text: 'State with a long label.' },
            { code: 'Idle : Waiting for orders', text: 'Adds a description inside a state.' },
          ],
        },
        {
          title: 'Composite states',
          items: [
            { code: 'state Running {\n    [*] --> Loading\n    Loading --> Ready\n}', text: 'State containing sub-states.' },
            { code: 'state Active {\n    [*] --> Audio\n    --\n    [*] --> Video\n}', text: 'Concurrent regions separated by <code>--</code>.' },
          ],
        },
        {
          title: 'Pseudo-states',
          items: [
            { code: 'state check <<choice>>\nIdle --> check\ncheck --> Running : valid\ncheck --> Error : invalid', text: 'Choice: one outgoing transition is taken.' },
            { code: 'state split <<fork>>\nstate merge <<join>>\n[*] --> split\nsplit --> Left\nsplit --> Right\nLeft --> merge\nRight --> merge\nmerge --> [*]', text: 'Fork and join of parallel paths.' },
          ],
        },
        {
          title: 'Notes and layout',
          items: [
            { code: 'Idle --> Running\nnote right of Idle : Short note', text: '<code>left of</code> or <code>right of</code> a state.' },
            { code: 'Idle --> Running\nnote left of Idle\n    Note on\n    several lines\nend note', text: 'Multi-line note.' },
            { code: 'direction LR', text: 'Layout direction: <code>TB</code>, <code>BT</code>, <code>LR</code> or <code>RL</code>.' },
          ],
        },
      ],
    },

    activity: {
      title: 'Activity diagram',
      header: 'flowchart TD',
      intro: 'Mermaid has no dedicated activity diagram: Lighthouse uses the flowchart syntax with UML shapes. Write <code>flowchart LR</code> on the first line for a horizontal layout.',
      sections: [
        {
          title: 'Nodes',
          items: [
            { code: 'begin@{ shape: start }', text: 'Start point.' },
            { code: 'finish@{ shape: stop }', text: 'End point.' },
            { code: 'prepare(Prepare order)', text: 'Action: identifier and label in parentheses.' },
            { code: 'paid{Paid?}', text: 'Decision or merge.' },
            { code: 'bar@{ shape: fork }', text: 'Fork or join bar.' },
          ],
        },
        {
          title: 'Flows',
          items: [
            { code: 'prepare(Prepare order) --> paid{Paid?}', text: 'Flow between two nodes. Nodes can be declared inline.' },
            { code: 'paid -- yes --> ship(Ship)', text: 'Guard on a flow.' },
            { code: 'paid -->|no| remind(Send reminder)', text: 'Alternative guard syntax.' },
            { code: 'remind -.-> paid', text: 'Dotted flow.' },
          ],
        },
        {
          title: 'Partitions',
          items: [
            { code: 'subgraph Warehouse\n    pick(Pick items) --> pack(Pack parcel)\nend', text: 'Groups the actions of one participant (swimlane).' },
            { code: '%% Comment', text: 'Ignored line, in every diagram type.' },
          ],
        },
      ],
    },

    other: {
      title: 'Diagram types',
      header: '',
      intro: 'The first line of the code sets the diagram type. Use the New menu (Ctrl+N) to start from a template.',
      sections: [
        {
          title: 'First lines',
          items: [
            { code: 'classDiagram', text: 'Class diagram.', insert: false },
            { code: 'sequenceDiagram', text: 'Sequence diagram.', insert: false },
            { code: 'usecase-beta', text: 'Use case diagram.', insert: false },
            { code: 'stateDiagram-v2', text: 'State diagram.', insert: false },
            { code: 'flowchart TD', text: 'Activity diagram.', insert: false },
          ],
        },
      ],
    },
  };

  const SHORTCUTS = [
    ['Editor', [
      ['Ctrl+Z', 'Undo'],
      ['Ctrl+Shift+Z, Ctrl+Y', 'Redo'],
      ['Tab, Shift+Tab', 'Indent, unindent the selected lines'],
      ['Ctrl+/', 'Comment or uncomment the selected lines'],
      ['Ctrl+D', 'Duplicate the selected lines'],
      ['Ctrl+Shift+K', 'Delete the selected lines'],
      ['Alt+Up, Alt+Down', 'Move the selected lines'],
      ['Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V', 'Select all, copy, cut, paste'],
    ]],
    ['Application', [
      ['F1', 'Show or hide this help'],
      ['Ctrl+N', 'New diagram from a template'],
      ['Ctrl+O', 'Open a Markdown file'],
      ['Ctrl+S, Ctrl+Shift+S', 'Save, save as'],
      ['Ctrl+Shift+C', 'Copy the Mermaid code'],
      ['Ctrl+E', 'Export as PNG'],
      ['Ctrl+0, Ctrl+1', 'Fit the preview, actual size'],
      ['Ctrl+R', 'Reload config.toml'],
    ]],
  ];

  window.LighthouseHelp = {
    content: (kind) => HELP[kind] ?? HELP.other,
    all: HELP,
    shortcuts: SHORTCUTS,
  };
})();
