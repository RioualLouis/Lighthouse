// Starting diagrams of the New menu.
'use strict';

window.LighthouseTemplates = {
  class: `classDiagram
    class Animal {
        <<abstract>>
        +String name
        +int age
        +makeSound()* void
    }
    class Pet {
        <<interface>>
        +play() void
    }
    class Size {
        <<enumeration>>
        SMALL
        MEDIUM
        LARGE
    }
    class Dog {
        +Size size
        +fetch() void
    }
    class Cat {
        -int lives
        +purr() void
    }
    class Owner {
        +String fullName
        +adopt(Animal animal) bool
    }
    Animal <|-- Dog
    Animal <|-- Cat
    Pet <|.. Dog
    Pet <|.. Cat
    Dog --> Size
    Owner "1" --> "*" Animal : owns
    note for Owner "Can adopt several animals"`,
  sequence: `sequenceDiagram
    autonumber
    actor User
    participant App as Lighthouse
    participant FS as File system
    User->>App: Open diagram.md
    activate App
    App->>FS: Read file
    FS-->>App: Markdown content
    App-->>User: Live preview
    deactivate App
    loop While editing
        User->>App: Type Mermaid code
        App-->>User: Refresh preview
    end
    Note over User,App: Export as .md or .png at any time`,
  usecase: `usecase-beta
    direction LR
    actor Customer
    actor Admin
    systemBoundary Shop["Online shop"]
        Browse(Browse catalog)
        Order(Place order)
        Pay(Pay online)
        Coupon(Apply coupon)
        Manage(Manage products)
    end
    Customer --> Browse
    Customer --> Order
    Order ..>:include Pay
    Coupon ..>:extend Order
    Admin --> Manage`,
  state: `stateDiagram-v2
    [*] --> Draft
    Draft --> Submitted : submit
    state Review {
        [*] --> Pending
        Pending --> Approved : accept
        Pending --> Rejected : refuse
        Approved --> [*]
        Rejected --> [*]
    }
    Submitted --> Review
    state verdict <<choice>>
    Review --> verdict
    verdict --> Published : approved
    verdict --> Draft : rejected
    Published --> [*]
    note right of Draft : Editable by the author`,
  activity: `flowchart TD
    start@{ shape: start }
    stop@{ shape: stop }
    fork@{ shape: fork }
    join@{ shape: fork }
    start --> receive(Receive order)
    receive --> stock{In stock?}
    stock -- no --> notify(Notify customer)
    notify --> stop
    stock -- yes --> fork
    fork --> ship(Ship items)
    fork --> invoice(Send invoice)
    ship --> join
    invoice --> join
    join --> close(Close order)
    close --> stop`,
};
